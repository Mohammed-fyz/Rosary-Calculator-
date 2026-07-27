package com.mohammedfyz.rosarycalc

import android.annotation.SuppressLint
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader

/**
 * شاشة التطبيق الوحيدة: WebView يعرض حاسبة المزاد المدمجة في assets/.
 *
 * الصفحة تُقدَّم عبر [WebViewAssetLoader] على أصل https بدل file://، لأن الأصول
 * من نوع file:// تُعامل في WebView الحديث كأصول مبهمة فلا يعمل عليها localStorage،
 * وهو ما تعتمد عليه الصفحة في حفظ سعر الصرف ونسبة رابط الدفع.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(APP_DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            // الصفحة نفسها ترسم خلفيتها؛ هذا يمنع وميض الأبيض قبل أول رسم في الوضع الليلي.
            setBackgroundColor(if (isNightMode()) NIGHT_BACKGROUND else DAY_BACKGROUND)
            isVerticalScrollBarEnabled = false
            overScrollMode = WebView.OVER_SCROLL_NEVER

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                // التصميم مضبوط على عرض الجهاز؛ التكبير يفسد تخطيط البطاقات.
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                // لا شيء يُحمَّل من الشبكة، فنغلق كل وصول خارجي على مستوى الـ WebView أيضًا.
                blockNetworkLoads = true
                allowFileAccess = false
                allowContentAccess = false
            }

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    // الصفحة الداخلية فقط تُعرض داخل التطبيق؛ أي رابط خارجي يذهب للمتصفح.
                    if (request.url.host == APP_DOMAIN) return false
                    return runCatching {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                        true
                    }.getOrDefault(true)
                }
            }

            addJavascriptInterface(WebAppBridge(this@MainActivity), BRIDGE_NAME)
        }

        setContentView(webView)
        applyStatusBarIcons()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(START_URL)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        webView.setBackgroundColor(if (isNightMode()) NIGHT_BACKGROUND else DAY_BACKGROUND)
        applyStatusBarIcons()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    /** شريط الحالة يعلو منطقة الـ hero الزرقاء الداكنة دائمًا، فالأيقونات تبقى فاتحة. */
    private fun applyStatusBarIcons() {
        WindowCompat.getInsetsController(window, webView).isAppearanceLightStatusBars = false
        WindowCompat.getInsetsController(window, webView).isAppearanceLightNavigationBars = !isNightMode()
    }

    private fun isNightMode(): Boolean =
        resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
            Configuration.UI_MODE_NIGHT_YES

    private companion object {
        const val APP_DOMAIN = "appassets.androidplatform.net"
        const val START_URL = "https://$APP_DOMAIN/assets/index.html"
        const val BRIDGE_NAME = "AndroidBridge"

        // مطابقة لمتغيّري --cream و --amber-950 في الصفحة.
        val DAY_BACKGROUND = Color.parseColor("#f9fafe")
        val NIGHT_BACKGROUND = Color.parseColor("#0a1730")
    }
}
