package com.deeyoungs.pro.ui.screens.more

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.deeyoungs.pro.ProApp
import com.deeyoungs.pro.core.session.SessionState
import com.deeyoungs.pro.core.settings.AppSettings
import com.deeyoungs.pro.core.settings.SettingsStore
import com.deeyoungs.pro.push.NotificationWorker
import com.deeyoungs.pro.ui.components.Panel
import com.deeyoungs.pro.ui.components.Pill
import com.deeyoungs.pro.ui.components.SectionTitle
import com.deeyoungs.pro.ui.navigation.Routes
import com.deeyoungs.pro.ui.theme.ThemeMode
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(nav: NavHostController) {
    val container = ProApp.container(LocalContext.current)
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val settings by container.settingsStore.settings.collectAsState(initial = AppSettings())
    val session by container.sessionManager.state.collectAsState()
    val user = (session as? SessionState.SignedIn)?.user
    var name by remember(user?.name) { mutableStateOf(user?.name ?: "") }
    var nameSaved by remember { mutableStateOf(false) }
    var changePw by remember { mutableStateOf(false) }
    var pwResult by remember { mutableStateOf<String?>(null) }
    var signOutConfirm by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { nav.popBackStack() }) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
            }
            Text("Settings", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        }

        // Profile
        Panel {
            SectionTitle("Profile")
            Text(user?.email ?: "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = name,
                onValueChange = { name = it; nameSaved = false },
                label = { Text("Display name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = {
                        scope.launch {
                            container.sessionManager.updateName(name)
                            nameSaved = true
                        }
                    },
                    enabled = name.isNotBlank() && name != user?.name,
                ) { Text("Save") }
                Spacer(Modifier.width(10.dp))
                if (nameSaved) Pill("saved", container = MaterialTheme.colorScheme.primaryContainer, content = MaterialTheme.colorScheme.primary)
            }
        }

        // Appearance
        Panel {
            SectionTitle("Appearance")
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(
                    selected = settings.themeMode == ThemeMode.SYSTEM,
                    onClick = { scope.launch { container.settingsStore.setThemeMode(ThemeMode.SYSTEM) } },
                    shape = SegmentedButtonDefaults.itemShape(0, 3),
                ) { Text("System") }
                SegmentedButton(
                    selected = settings.themeMode == ThemeMode.DARK,
                    onClick = { scope.launch { container.settingsStore.setThemeMode(ThemeMode.DARK) } },
                    shape = SegmentedButtonDefaults.itemShape(1, 3),
                ) { Text("Dark") }
                SegmentedButton(
                    selected = settings.themeMode == ThemeMode.LIGHT,
                    onClick = { scope.launch { container.settingsStore.setThemeMode(ThemeMode.LIGHT) } },
                    shape = SegmentedButtonDefaults.itemShape(2, 3),
                ) { Text("Light") }
            }
        }

        // Security
        Panel {
            SectionTitle("Security")
            val biometricsAvailable = remember {
                BiometricManager.from(context)
                    .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) ==
                    BiometricManager.BIOMETRIC_SUCCESS
            }
            SettingToggle(
                title = "Biometric app lock",
                subtitle = if (biometricsAvailable) "Require fingerprint or face at every cold start" else "No biometrics enrolled on this device",
                checked = settings.biometricLock && biometricsAvailable,
                enabled = biometricsAvailable,
            ) { enabled ->
                scope.launch { container.settingsStore.setBiometricLock(enabled) }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Change password", style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "Uses the same secure better-auth endpoint as the website",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextButton(onClick = { changePw = true }) { Text("Change") }
            }
        }

        // Notifications
        Panel {
            SectionTitle("Notifications")
            SettingToggle(
                title = "Trade and account alerts",
                subtitle = "Checks your account for new HIGH priority events (about every 15 minutes) and alerts you natively",
                checked = settings.notificationsEnabled,
                enabled = true,
            ) { enabled ->
                scope.launch {
                    container.settingsStore.setNotificationsEnabled(enabled)
                    if (enabled) NotificationWorker.schedule(context) else NotificationWorker.cancel(context)
                }
            }
            LaunchedEffect(Unit) {
                if (settings.notificationsEnabled) NotificationWorker.schedule(context)
            }
        }

        // Plan
        Panel {
            SectionTitle("Plan")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    user?.plan ?: "FREE",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Button(onClick = { nav.navigate(Routes.pricing()) }) { Text("Manage") }
            }
        }

        Button(
            onClick = { signOutConfirm = true },
            modifier = Modifier.fillMaxWidth(),
            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.errorContainer,
                contentColor = MaterialTheme.colorScheme.error,
            ),
        ) { Text("Sign out") }

        Text(
            "Session tokens are stored encrypted with the Android Keystore and are excluded from backups.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
    }

    if (changePw) {
        ChangePasswordDialog(
            result = pwResult,
            onDismiss = { changePw = false; pwResult = null },
            onSubmit = { current, new ->
                scope.launch {
                    pwResult = when (val res = container.sessionManager.changePassword(current, new)) {
                        is com.deeyoungs.pro.data.ApiResult.Success ->
                            if (res.data.status == true) {
                                "Password changed."
                            } else {
                                res.data.message ?: "Could not change the password. Check the current one."
                            }
                        is com.deeyoungs.pro.data.ApiResult.HttpError -> res.message
                        is com.deeyoungs.pro.data.ApiResult.Offline -> "No connection: nothing was changed."
                        else -> "Could not change the password right now."
                    }
                }
            },
        )
    }

    if (signOutConfirm) {
        AlertDialog(
            onDismissRequest = { signOutConfirm = false },
            title = { Text("Sign out?") },
            text = { Text("Your session on this device is revoked and cleared. The web session stays active elsewhere.") },
            confirmButton = {
                TextButton(onClick = {
                    signOutConfirm = false
                    scope.launch {
                        container.sessionManager.signOut()
                    }
                }) { Text("Sign out") }
            },
            dismissButton = { TextButton(onClick = { signOutConfirm = false }) { Text("Cancel") } },
        )
    }
}

private object ApiSuccessShim

@Composable
private fun SettingToggle(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean = true,
    onChange: (Boolean) -> Unit,
) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(8.dp))
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

@Composable
private fun ChangePasswordDialog(
    result: String?,
    onDismiss: () -> Unit,
    onSubmit: (String, String) -> Unit,
) {
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Change password") },
        text = {
            Column {
                OutlinedTextField(
                    value = current, onValueChange = { current = it },
                    label = { Text("Current password") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = new, onValueChange = { new = it },
                    label = { Text("New password (8+)") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = confirm, onValueChange = { confirm = it },
                    label = { Text("Repeat new password") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                )
                result?.let {
                    Spacer(Modifier.height(10.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSubmit(current, new) },
                enabled = current.isNotBlank() && new.length >= 8 && new == confirm,
            ) { Text("Change") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
