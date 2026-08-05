package com.pritesh.calldetection;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.WindowManager;

/**
 * Trampolim para abrir pós-chamada com app em segundo plano (Samsung / Android 12+).
 */
public final class KoomindPostCallLaunchActivity extends Activity {

    private static final String TAG = "KooMindPostCall";
    public static final String EXTRA_SESSION_ID = "sessionId";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }

        String sessionId = getIntent().getStringExtra(EXTRA_SESSION_ID);
        if (sessionId == null || sessionId.isEmpty()) {
            finish();
            return;
        }

        openPostCall(sessionId);
    }

    private void openPostCall(String sessionId) {
        String pkg = getPackageName();
        Uri uri = Uri.parse("secretina://post-call/" + Uri.encode(sessionId));
        int flags = Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT;

        try {
            Intent main = new Intent(Intent.ACTION_VIEW, uri);
            main.setClassName(pkg, pkg + ".MainActivity");
            main.addFlags(flags);
            startActivity(main);
            Log.i(TAG, "MainActivity VIEW session=" + sessionId);
            finishDelayed();
            return;
        } catch (Exception e) {
            Log.w(TAG, "MainActivity VIEW", e);
        }

        try {
            Intent view = new Intent(Intent.ACTION_VIEW, uri);
            view.setPackage(pkg);
            view.addFlags(flags);
            startActivity(view);
            Log.i(TAG, "package VIEW session=" + sessionId);
            finishDelayed();
            return;
        } catch (Exception e) {
            Log.w(TAG, "package VIEW", e);
        }

        try {
            Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
            if (launch != null) {
                launch.putExtra(EXTRA_SESSION_ID, sessionId);
                launch.addFlags(flags);
                startActivity(launch);
                Log.i(TAG, "launchIntent session=" + sessionId);
            }
        } catch (Exception e) {
            Log.w(TAG, "launchIntent", e);
        }

        CallDetectionManagerModule.bringAppToForeground(getApplicationContext());
        finishDelayed();
    }

    private void finishDelayed() {
        new Handler(Looper.getMainLooper()).postDelayed(this::finish, 450);
    }
}
