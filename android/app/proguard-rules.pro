# Keep the JavaScript bridge methods
-keepclassmembers class com.suits.fretwise.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
