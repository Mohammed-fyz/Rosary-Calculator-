# الجسر بين JavaScript و Kotlin يُستدعى بالانعكاس من داخل الـ WebView،
# فلا بد من الإبقاء على أسماء الدوال الموسومة بـ @JavascriptInterface.
-keepclassmembers class com.mohammedfyz.rosarycalc.WebAppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
