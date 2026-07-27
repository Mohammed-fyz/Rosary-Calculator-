package com.mohammedfyz.rosarycalc

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * جسر صغير يتيح لصفحة الحاسبة نسخ النتيجة أو مشاركتها عبر تطبيقات الجوال.
 *
 * يُسجَّل فقط على أصل التطبيق المحلي (appassets.androidplatform.net) — راجع
 * [MainActivity] حيث يُتحقق من الأصل قبل تنفيذ أي تنقّل.
 */
class WebAppBridge(private val activity: Activity) {

    @JavascriptInterface
    fun copy(text: String) {
        activity.runOnUiThread {
            val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText(activity.getString(R.string.app_name), text))
            // أندرويد 13 فما فوق يعرض إشعار نسخ خاصًا به، فلا داعي لتكراره.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                Toast.makeText(activity, R.string.copied, Toast.LENGTH_SHORT).show()
            }
        }
    }

    @JavascriptInterface
    fun share(text: String) {
        activity.runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }
            activity.startActivity(Intent.createChooser(send, activity.getString(R.string.share_via)))
        }
    }
}
