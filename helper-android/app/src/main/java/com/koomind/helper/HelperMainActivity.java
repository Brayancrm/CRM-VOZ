package com.koomind.helper;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.accessibility.AccessibilityManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

public final class HelperMainActivity extends AppCompatActivity {

    private static final String PREFS = "koomind_helper_prefs";
    private static final String KEY_SETUP_DONE = "setup_complete";

    private static final int REQ_RUNTIME = 2000;

    private TextView statusText;
    private TextView hintText;
    private Button btnRequestAll;
    private Button btnRestricted;
    private Button btnAccessibility;
    private Button btnContinue;
    private Button btnKoomind;
    private Button btnRefresh;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusText = findViewById(R.id.statusText);
        hintText = findViewById(R.id.hintText);
        btnRequestAll = findViewById(R.id.btnRequestAll);
        btnRestricted = findViewById(R.id.btnRestricted);
        btnAccessibility = findViewById(R.id.btnAccessibility);
        btnContinue = findViewById(R.id.btnContinue);
        btnKoomind = findViewById(R.id.btnKoomind);
        btnRefresh = findViewById(R.id.btnRefresh);

        btnRequestAll.setOnClickListener(v -> requestAllRuntimePermissions());
        btnRestricted.setOnClickListener(v -> openAppDetails());
        btnAccessibility.setOnClickListener(v -> openAccessibilitySettings());
        btnKoomind.setOnClickListener(v -> openKoomind());
        btnRefresh.setOnClickListener(v -> refreshStatus());
        btnContinue.setOnClickListener(v -> completeSetup());

        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RUNTIME) {
            refreshStatus();
        }
    }

    private void refreshStatus() {
        boolean mic = hasPermission(Manifest.permission.RECORD_AUDIO);
        boolean phone = hasPermission(Manifest.permission.READ_PHONE_STATE);
        boolean notif = !needsNotificationPermission() || hasPermission(Manifest.permission.POST_NOTIFICATIONS);
        boolean connector = isConnectorEnabled();
        boolean koomind = isKoomindInstalled();
        boolean restrictedOk = !needsRestrictedStep() || connector;

        boolean allReady = mic && phone && notif && connector;

        if (!allReady) {
            getPrefs().edit().putBoolean(KEY_SETUP_DONE, false).apply();
            showGateUi(allReady, mic, phone, notif, connector, koomind, restrictedOk);
            return;
        }

        if (!getPrefs().getBoolean(KEY_SETUP_DONE, false)) {
            completeSetup();
            return;
        }

        showDashboardUi(koomind, connector);
    }

    private void showGateUi(
            boolean allReady,
            boolean mic,
            boolean phone,
            boolean notif,
            boolean connector,
            boolean koomind,
            boolean restrictedOk
    ) {
        btnRequestAll.setVisibility(View.VISIBLE);
        btnRestricted.setVisibility(needsRestrictedStep() && !connector ? View.VISIBLE : View.GONE);
        btnAccessibility.setVisibility(connector ? View.GONE : View.VISIBLE);
        btnContinue.setVisibility(View.VISIBLE);
        btnContinue.setEnabled(allReady);
        btnKoomind.setVisibility(View.GONE);
        btnRefresh.setVisibility(View.GONE);
        hintText.setVisibility(View.VISIBLE);

        StringBuilder sb = new StringBuilder();
        appendLine(sb, getString(R.string.status_mic), mic);
        appendLine(sb, getString(R.string.status_phone), phone);
        if (needsNotificationPermission()) {
            appendLine(sb, getString(R.string.status_notifications), notif);
        }
        if (needsRestrictedStep()) {
            appendLine(sb, getString(R.string.status_restricted), restrictedOk);
        }
        appendLine(sb, getString(R.string.status_connector), connector);
        appendLine(sb, getString(R.string.status_koomind), koomind);

        if (allReady) {
            sb.append("\n").append(getString(R.string.all_ready_hint));
        } else {
            sb.append("\n").append(getString(R.string.pending_hint));
        }

        statusText.setText(sb.toString());
    }

    private void showDashboardUi(boolean koomind, boolean connector) {
        btnRequestAll.setVisibility(View.GONE);
        btnRestricted.setVisibility(View.GONE);
        btnAccessibility.setVisibility(connector ? View.GONE : View.VISIBLE);
        btnContinue.setVisibility(View.GONE);
        btnKoomind.setVisibility(View.VISIBLE);
        btnRefresh.setVisibility(View.VISIBLE);
        hintText.setVisibility(View.GONE);

        StringBuilder sb = new StringBuilder();
        sb.append(getString(R.string.dashboard_ready)).append("\n\n");
        appendLine(sb, getString(R.string.status_connector), connector);
        appendLine(sb, getString(R.string.status_koomind), koomind);
        statusText.setText(sb.toString());
    }

    private void completeSetup() {
        if (!isAllPermissionsReady()) return;
        getPrefs().edit().putBoolean(KEY_SETUP_DONE, true).apply();
        showDashboardUi(isKoomindInstalled(), isConnectorEnabled());
    }

    private boolean isAllPermissionsReady() {
        boolean mic = hasPermission(Manifest.permission.RECORD_AUDIO);
        boolean phone = hasPermission(Manifest.permission.READ_PHONE_STATE);
        boolean notif = !needsNotificationPermission() || hasPermission(Manifest.permission.POST_NOTIFICATIONS);
        return mic && phone && notif && isConnectorEnabled();
    }

    private void requestAllRuntimePermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        List<String> needed = new ArrayList<>();
        if (!hasPermission(Manifest.permission.RECORD_AUDIO)) {
            needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (!hasPermission(Manifest.permission.READ_PHONE_STATE)) {
            needed.add(Manifest.permission.READ_PHONE_STATE);
        }
        if (needsNotificationPermission()
                && !hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (needed.isEmpty()) {
            refreshStatus();
            return;
        }

        ActivityCompat.requestPermissions(
                this,
                needed.toArray(new String[0]),
                REQ_RUNTIME
        );
    }

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean needsNotificationPermission() {
        return Build.VERSION.SDK_INT >= 33;
    }

    private boolean needsRestrictedStep() {
        return Build.VERSION.SDK_INT >= 33;
    }

    private SharedPreferences getPrefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private static void appendLine(StringBuilder sb, String label, boolean ok) {
        sb.append(label).append(": ").append(ok ? "OK ✓" : "Pendente").append('\n');
    }

    private boolean isKoomindInstalled() {
        try {
            getPackageManager().getPackageInfo(HelperConstants.KOOMIND_PACKAGE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private boolean isConnectorEnabled() {
        AccessibilityManager am =
                (AccessibilityManager) getSystemService(ACCESSIBILITY_SERVICE);
        if (am == null) return false;
        List<AccessibilityServiceInfo> enabled =
                am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        if (enabled == null) return false;
        for (AccessibilityServiceInfo info : enabled) {
            if (info.getResolveInfo() == null || info.getResolveInfo().serviceInfo == null) {
                continue;
            }
            String pkg = info.getResolveInfo().serviceInfo.packageName;
            if (HelperConstants.HELPER_PACKAGE.equals(pkg)) {
                return true;
            }
        }
        return false;
    }

    private void openAppDetails() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getPackageName()));
        startActivity(intent);
    }

    private void openAccessibilitySettings() {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        startActivity(intent);
    }

    private void openKoomind() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(HelperConstants.KOOMIND_PACKAGE);
        if (launch != null) {
            startActivity(launch);
            return;
        }
        Intent market = new Intent(Intent.ACTION_VIEW);
        market.setData(Uri.parse("market://details?id=" + HelperConstants.KOOMIND_PACKAGE));
        startActivity(market);
    }
}
