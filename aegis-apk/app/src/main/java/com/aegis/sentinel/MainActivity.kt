package com.aegis.sentinel

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView

// Minimal host: the whole Aegis Sentinel UI + logic is the offline web app in
// assets/index.html, running on-device via WebCrypto. No network is used.
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.loadUrl("file:///android_asset/index.html")
        setContentView(web)
    }
}
