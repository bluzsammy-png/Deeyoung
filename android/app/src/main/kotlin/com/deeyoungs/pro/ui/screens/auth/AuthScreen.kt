package com.deeyoungs.pro.ui.screens.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.deeyoungs.pro.ProApp
import com.deeyoungs.pro.R
import com.deeyoungs.pro.core.session.SessionManager
import com.deeyoungs.pro.data.ApiResult
import com.deeyoungs.pro.ui.theme.Grotesk
import com.deeyoungs.pro.ui.theme.MarketColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.material3.AssistChip
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/**
 * Sign-in / sign-up / forgot-password, one screen with a mode switcher,
 * matching the web's auth gate but built with Material 3 inputs.
 */
@Composable
fun AuthScreen(onSessionMessage: (String) -> Unit) {
    val container = ProApp.container(LocalContext.current)
    val vm: AuthViewModel = viewModel(factory = simpleFactory { AuthViewModel(container.sessionManager) })
    val state by vm.state.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(64.dp))
        Image(
            painter = painterResource(R.drawable.ic_splash_logo),
            contentDescription = "DeeYoung Pro",
            modifier = Modifier.size(72.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            "DeeYoung Pro",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
            fontFamily = Grotesk,
        )
        Text(
            "Market signals, catalysts and risk",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(28.dp))

        var mode by rememberSaveable { mutableStateOf(0) }
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            SegmentedButton(
                selected = mode == 0,
                onClick = { mode = 0 },
                shape = SegmentedButtonDefaults.itemShape(0, 2),
            ) { Text("Sign in") }
            SegmentedButton(
                selected = mode == 1,
                onClick = { mode = 1 },
                shape = SegmentedButtonDefaults.itemShape(1, 2),
            ) { Text("Create account") }
        }
        Spacer(Modifier.height(20.dp))

        when (mode) {
            0 -> SignInForm(vm, onForgot = { mode = 2 })
            1 -> SignUpForm(vm)
            else -> ForgotForm(vm)
        }

        state.error?.let { error ->
            Spacer(Modifier.height(12.dp))
            Text(
                error,
                color = MarketColors.neg(),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
        state.info?.let { info ->
            Spacer(Modifier.height(12.dp))
            Text(
                info,
                color = MarketColors.pos(),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(32.dp))
        Text(
            "By continuing you agree to the terms at deyoungpro.site. " +
                "Markets carry risk: analysis here is information, not advice.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun SignInForm(vm: AuthViewModel, onForgot: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showPw by rememberSaveable { mutableStateOf(false) }
    val state by vm.state.collectAsState()
    val busy = state.busy

    OutlinedTextField(
        value = email,
        onValueChange = { email = it },
        label = { Text("Email") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next, keyboardType = KeyboardType.Email),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(10.dp))
    OutlinedTextField(
        value = password,
        onValueChange = { password = it },
        label = { Text("Password") },
        singleLine = true,
        visualTransformation = if (showPw) VisualTransformation.None else PasswordVisualTransformation(),
        trailingIcon = {
            IconButton(onClick = { showPw = !showPw }) {
                Icon(if (showPw) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, contentDescription = if (showPw) "Hide password" else "Show password")
            }
        },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { vm.signIn(email, password) }),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(18.dp))
    Button(
        onClick = { vm.signIn(email, password) },
        enabled = !busy && email.isNotBlank() && password.isNotBlank(),
        modifier = Modifier.fillMaxWidth().height(48.dp),
    ) {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Sign in")
    }
    TextButton(onClick = onForgot, modifier = Modifier.padding(top = 6.dp)) {
        Text("Forgot password?")
    }
}

@Composable
private fun SignUpForm(vm: AuthViewModel) {
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showPw by rememberSaveable { mutableStateOf(false) }
    val state by vm.state.collectAsState()
    val busy = state.busy

    OutlinedTextField(
        value = name, onValueChange = { name = it },
        label = { Text("Name") }, singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(10.dp))
    OutlinedTextField(
        value = email, onValueChange = { email = it },
        label = { Text("Email") }, singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next, keyboardType = KeyboardType.Email),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(10.dp))
    OutlinedTextField(
        value = password, onValueChange = { password = it },
        label = { Text("Password (8+ characters)") }, singleLine = true,
        visualTransformation = if (showPw) VisualTransformation.None else PasswordVisualTransformation(),
        trailingIcon = {
            IconButton(onClick = { showPw = !showPw }) {
                Icon(if (showPw) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, contentDescription = if (showPw) "Hide password" else "Show password")
            }
        },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { vm.signUp(name, email, password) }),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(18.dp))
    Button(
        onClick = { vm.signUp(name, email, password) },
        enabled = !busy && name.isNotBlank() && email.isNotBlank() && password.length >= 8,
        modifier = Modifier.fillMaxWidth().height(48.dp),
    ) {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Create account")
    }
    Spacer(Modifier.height(8.dp))
    Text(
        "Production signups verify their email before the terminal opens. " +
            "Check your inbox after creating the account.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ForgotForm(vm: AuthViewModel) {
    var email by rememberSaveable { mutableStateOf("") }
    val state by vm.state.collectAsState()
    OutlinedTextField(
        value = email, onValueChange = { email = it },
        label = { Text("Account email") }, singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done, keyboardType = KeyboardType.Email),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(18.dp))
    Button(
        onClick = { vm.forgot(email) },
        enabled = !state.busy && email.isNotBlank(),
        modifier = Modifier.fillMaxWidth().height(48.dp),
    ) {
        if (state.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Send reset link")
    }
    Text(
        "The reset link opens the web app, then you can return here and sign in.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 8.dp),
    )
}

/** Biometric unlock overlay shown at cold start when the lock is enabled. */
@Composable
fun BiometricLock(onUnlocked: () -> Unit) {
    val context = LocalContext.current
    var attempted by remember { mutableStateOf(false) }

    fun prompt() {
        val fragmentActivity = context as? FragmentActivity ?: run { onUnlocked(); return }
        val bm = BiometricManager.from(context)
        val can = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
        if (can != BiometricManager.BIOMETRIC_SUCCESS) {
            onUnlocked()
            return
        }
        val prompt = BiometricPrompt(
            fragmentActivity,
            ContextCompat.getMainExecutor(context),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onUnlocked()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    // Keep the lock up; the user can retry or use the fallback button.
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock DeeYoung Pro")
            .setSubtitle("Your session stays protected on this device")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
            .build()
        prompt.authenticate(info)
    }

    LaunchedEffect(Unit) { if (!attempted) { attempted = true; prompt() } }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Rounded.Fingerprint,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(12.dp))
            Text("Locked", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Text(
                "Authenticate to open your terminal",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            Row {
                AssistChip(onClick = { prompt() }, label = { Text("Try again") })
                Spacer(Modifier.width(8.dp))
                AssistChip(onClick = onUnlocked, label = { Text("Use password instead") })
            }
        }
    }
}

/** Tiny factory helper so ViewModels can receive the container. */
fun <T : ViewModel> simpleFactory(create: () -> T) = object : androidx.lifecycle.ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <VM : ViewModel> create(modelClass: Class<VM>): VM = create() as VM
}

data class AuthUiState(
    val busy: Boolean = false,
    val error: String? = null,
    val info: String? = null,
)

class AuthViewModel(private val sessions: SessionManager) : ViewModel() {

    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    fun signIn(email: String, password: String) = launch {
        when (val res = sessions.signIn(email, password)) {
            is ApiResult.Success -> _state.value = AuthUiState()
            is ApiResult.Paywalled -> err(res.message)
            is ApiResult.HttpError -> err(res.message)
            is ApiResult.Offline -> err("No connection. Check your network and retry.")
            is ApiResult.RateLimited -> err("Too many attempts. Wait a minute and retry.")
            else -> err("Sign-in failed. Check your email and password.")
        }
    }

    fun signUp(name: String, email: String, password: String) = launch {
        when (val res = sessions.signUp(name, email, password)) {
            is ApiResult.Success -> _state.value = AuthUiState()
            is ApiResult.Paywalled -> err(res.message)
            is ApiResult.HttpError -> err(res.message)
            is ApiResult.Offline -> err("No connection. Check your network and retry.")
            is ApiResult.RateLimited -> err("Too many signups from this network. Try again later.")
            else -> err("Could not create the account. Try again.")
        }
    }

    fun forgot(email: String) = launch {
        when (val res = sessions.sendPasswordReset(email)) {
            is ApiResult.Success ->
                _state.value = AuthUiState(info = "If that address has an account, a reset link is on its way.")
            is ApiResult.HttpError -> err(res.message)
            is ApiResult.Offline -> err("No connection. Check your network and retry.")
            else -> err("Could not send the reset email right now.")
        }
    }

    private fun err(message: String?) {
        _state.value = AuthUiState(error = message ?: "Something went wrong. Try again.")
    }

    private fun launch(block: suspend () -> Unit) {
        _state.value = AuthUiState(busy = true)
        viewModelScope.launch {
            try {
                block()
            } finally {
                if (_state.value.busy) {
                    _state.value = _state.value.copy(busy = false)
                }
            }
        }
    }
}
