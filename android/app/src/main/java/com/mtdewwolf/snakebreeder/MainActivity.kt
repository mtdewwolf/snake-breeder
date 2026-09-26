package com.mtdewwolf.snakebreeder

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams
import androidx.core.view.updatePadding
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/**
 * Hosts the Scale & نسل game. The game is the exact HTML/CSS/JS from the repository root,
 * bundled into the APK and served from https://appassets.androidplatform.net so that
 * localStorage saves, fonts and layout behave exactly as in the browser, fully offline.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var navBarBg: View
    private var pageReady = false
    private val startedAt = SystemClock.uptimeMillis()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // Both bars sit on dark wood, so use light system icons.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        setContentView(R.layout.activity_main)
        splash.setKeepOnScreenCondition {
            !pageReady && SystemClock.uptimeMillis() - startedAt < SPLASH_TIMEOUT_MS
        }

        webView = findViewById(R.id.game)
        navBarBg = findViewById(R.id.nav_bar_bg)
        applyInsets()
        updateNavBarColour(resources.configuration)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true // the game saves to localStorage
            allowFileAccess = false
            allowContentAccess = false
            useWideViewPort = true // honour <meta name="viewport">
            loadWithOverviewMode = false
            setSupportZoom(false)
            textZoom = 100
        }
        webView.webViewClient = GameWebViewClient()

        onBackPressedDispatcher.addCallback(this, backCallback)

        // The game restores itself (save and last open tab) from localStorage.
        webView.loadUrl(START_URL)
    }

    /** Pads the game clear of the system bars, cutouts and keyboard, painting the bars in game colours. */
    private fun applyInsets() {
        val root = findViewById<View>(R.id.root)
        val statusBarBg = findViewById<View>(R.id.status_bar_bg)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, windowInsets ->
            val bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            val ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
            view.updatePadding(left = bars.left, right = bars.right)
            statusBarBg.updateLayoutParams { height = bars.top }
            navBarBg.updateLayoutParams { height = maxOf(bars.bottom, ime.bottom) }
            WindowInsetsCompat.CONSUMED
        }
    }

    /**
     * Below the stylesheet's 760px breakpoint the dock is pinned to the bottom of the screen,
     * so the navigation bar continues its wood colour; on wider screens the page background shows.
     */
    private fun updateNavBarColour(config: Configuration) {
        val colour = if (config.screenWidthDp <= MOBILE_BREAKPOINT_DP) R.color.wood_dark else R.color.wall
        navBarBg.setBackgroundColor(ContextCompat.getColor(this, colour))
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        updateNavBarColour(newConfig)
    }

    /** Back closes an open dialog, then returns to the Room tab, then leaves the app. */
    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            if (!pageReady) {
                finishToBackground()
                return
            }
            webView.evaluateJavascript(BACK_SCRIPT) { handled ->
                if (handled != "true") finishToBackground()
            }
        }
    }

    private fun finishToBackground() {
        // Keep the WebView (and the running game) alive, like pressing Home.
        moveTaskToBack(true)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        webView.onPause()
        webView.pauseTimers()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private inner class GameWebViewClient : WebViewClient() {
        private val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ASSET_HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this@MainActivity))
            .build()

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            val url = request.url
            return when (url.host) {
                ASSET_HOST -> assetLoader.shouldInterceptRequest(url) ?: notFound()
                // index.html asks Google Fonts for Lilita One and Nunito; serve the bundled copies.
                FONTS_HOST -> WebResourceResponse("text/css", "utf-8", assets.open("fonts/fonts.css"))
                // The game makes no other requests; keep it fully offline.
                else -> notFound()
            }
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (request.url.host == ASSET_HOST) return false
            openExternally(request.url)
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            pageReady = true
        }

        private fun notFound() = WebResourceResponse(
            "text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)),
        )
    }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            // Nothing can open it; stay in the game.
        }
    }

    private companion object {
        const val ASSET_HOST = WebViewAssetLoader.DEFAULT_DOMAIN
        const val FONTS_HOST = "fonts.googleapis.com"
        const val START_URL = "https://$ASSET_HOST/assets/game/index.html"
        const val MOBILE_BREAKPOINT_DP = 760
        const val SPLASH_TIMEOUT_MS = 2000L

        /**
         * Mirrors what a player would tap: the dialog's ✕ button, or the Room tab in the dock.
         * Returns true when the game handled the back press.
         */
        const val BACK_SCRIPT = """(function () {
  var dialog = document.getElementById('dialog');
  if (dialog && dialog.open) {
    var close = dialog.querySelector('.dialog-head [data-action="close-dialog"]');
    if (close) close.click(); else dialog.close();
    return true;
  }
  var active = document.querySelector('.dock-btn.is-active');
  var room = document.querySelector('.dock-btn[data-view="overview"]');
  if (active && room && active !== room) { room.click(); return true; }
  return false;
})()"""
    }
}
