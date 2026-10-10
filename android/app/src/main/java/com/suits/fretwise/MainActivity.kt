package com.suits.fretwise

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * Fretwise for Android: hosts the shared web app (bundled in assets) in a WebView,
 * served from a private https origin so storage, audio and modules all behave like the iPad version.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private var pendingSave: String? = null
    private var pageReady = false
    private val queuedFiles = mutableListOf<Uri>()

    private val openFiles = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        deliverFiles(uris ?: emptyList())
    }
    private val saveText = registerForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        writePending(uri)
    }
    private val saveJson = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        writePending(uri)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)

        root = FrameLayout(this)
        root.setBackgroundColor(STAGE)
        web = WebView(this)
        web.setBackgroundColor(STAGE)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Keep the app clear of the status bar, camera cutout, gesture bar and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
        }
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.addJavascriptInterface(Bridge(), "FretwiseAndroid")
        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == HOST) return false
                // Links to anywhere else open in the browser
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, u)) }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = true
                if (queuedFiles.isNotEmpty()) {
                    val list = queuedFiles.toList()
                    queuedFiles.clear()
                    importIntoApp(list)
                }
            }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("https://$HOST/assets/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        handleIncoming(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncoming(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    /** Song files opened from Files, a download or a share sheet. */
    private fun handleIncoming(intent: Intent?) {
        if (intent == null) return
        val uris = mutableListOf<Uri>()
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.data?.let { uris.add(it) }
            Intent.ACTION_SEND -> {
                @Suppress("DEPRECATION")
                (intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { uris.add(it) }
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                if (uris.isEmpty() && !text.isNullOrBlank()) {
                    val title = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: "Shared song"
                    sendToApp(JSONArray().put(JSONObject().put("name", "$title.txt").put("text", text)), import = true)
                }
            }
        }
        if (uris.isEmpty()) return
        if (pageReady) importIntoApp(uris) else queuedFiles.addAll(uris)
    }

    private fun importIntoApp(uris: List<Uri>) = sendToApp(readAll(uris), import = true)

    private fun readAll(uris: List<Uri>): JSONArray {
        val arr = JSONArray()
        for (u in uris) {
            runCatching {
                val text = contentResolver.openInputStream(u)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return@runCatching
                arr.put(JSONObject().put("name", displayName(u)).put("text", text))
            }
        }
        return arr
    }

    private fun deliverFiles(uris: List<Uri>) = sendToApp(readAll(uris), import = false)

    private fun sendToApp(files: JSONArray, import: Boolean) {
        val fn = if (import) "window.__fretwiseImport" else "window.__fretwiseFiles"
        val js = "$fn && $fn(${files});"
        web.post { web.evaluateJavascript(js, null) }
    }

    private fun displayName(u: Uri): String {
        contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) return c.getString(0) ?: "song.txt"
        }
        return u.lastPathSegment ?: "song.txt"
    }

    private fun writePending(uri: Uri?) {
        val text = pendingSave
        pendingSave = null
        if (uri == null || text == null) return
        val ok = runCatching {
            contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
        }.isSuccess
        Toast.makeText(this, if (ok) "Saved" else "Couldn't save that file", Toast.LENGTH_SHORT).show()
    }

    /** Methods the web app calls as window.FretwiseAndroid.* */
    inner class Bridge {
        @JavascriptInterface
        fun saveFile(name: String, mime: String, text: String) {
            runOnUiThread {
                pendingSave = text
                if (mime.contains("json")) saveJson.launch(name) else saveText.launch(name)
            }
        }

        @JavascriptInterface
        fun openFiles(multiple: Boolean) {
            runOnUiThread { openFiles.launch(arrayOf("text/*", "application/json", "application/octet-stream")) }
        }

        @JavascriptInterface
        fun keepAwake(on: Boolean) {
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        @JavascriptInterface
        fun setDark(dark: Boolean) {
            runOnUiThread {
                val bg = if (dark) STAGE else DAY
                root.setBackgroundColor(bg)
                web.setBackgroundColor(bg)
                val style = if (dark) SystemBarStyle.dark(Color.TRANSPARENT)
                else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
            }
        }
    }

    companion object {
        const val HOST = "appassets.androidplatform.net"
        val STAGE = Color.parseColor("#1D1511")
        val DAY = Color.parseColor("#ECEBE6")
    }
}
