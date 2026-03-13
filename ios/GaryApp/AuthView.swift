import SwiftUI
import AuthenticationServices

// MARK: - Auth View (Sign In / Sign Up)

struct AuthView: View {
    @ObservedObject var authManager = AuthManager.shared
    @State private var isSignUp = false
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isSubmitting = false
    @State private var showForgotPassword = false
    @State private var resetEmail = ""
    @State private var resetSent = false
    @State private var animateIn = false

    var body: some View {
        ZStack {
            LiquidGlassBackground()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 24) {
                    Spacer(minLength: 40)

                    // Logo
                    VStack(spacing: 0) {
                        Image("GaryIconBG")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 180, height: 180)

                        Text("GARY A.I.")
                            .font(.system(size: 28, weight: .heavy))
                            .tracking(-0.5)
                            .foregroundStyle(GaryColors.goldGradient)

                        Text(isSignUp ? "Create Your Account" : "Welcome Back")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .opacity(animateIn ? 1 : 0)
                    .scaleEffect(animateIn ? 1 : 0.8)
                    .animation(.easeOut(duration: 0.6).delay(0.1), value: animateIn)

                    // Error Banner
                    if let error = authManager.errorMessage {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(GaryColors.gold)
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.white)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(Color.red.opacity(0.15))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .stroke(Color.red.opacity(0.3), lineWidth: 0.5)
                                )
                        )
                        .padding(.horizontal, 24)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // Email/Password Fields
                    VStack(spacing: 14) {
                        AuthTextField(
                            icon: "envelope.fill",
                            placeholder: "Email",
                            text: $email,
                            isSecure: false,
                            keyboardType: .emailAddress,
                            textContentType: .emailAddress
                        )

                        AuthTextField(
                            icon: "lock.fill",
                            placeholder: "Password",
                            text: $password,
                            isSecure: true,
                            textContentType: isSignUp ? .newPassword : .password
                        )

                        if isSignUp {
                            AuthTextField(
                                icon: "lock.shield.fill",
                                placeholder: "Confirm Password",
                                text: $confirmPassword,
                                isSecure: true,
                                textContentType: .newPassword
                            )
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    .padding(.horizontal, 24)
                    .opacity(animateIn ? 1 : 0)
                    .offset(y: animateIn ? 0 : 20)
                    .animation(.easeOut(duration: 0.6).delay(0.2), value: animateIn)

                    // Submit Button
                    Button {
                        Task { await handleSubmit() }
                    } label: {
                        HStack(spacing: 10) {
                            if isSubmitting {
                                ProgressView()
                                    .tint(.black)
                            } else {
                                Image(systemName: isSignUp ? "person.badge.plus" : "arrow.right.circle.fill")
                                Text(isSignUp ? "Create Account" : "Sign In")
                                    .font(.headline.bold())
                            }
                        }
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(GaryColors.goldGradient)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .shadow(color: GaryColors.gold.opacity(0.4), radius: 12, y: 6)
                    }
                    .disabled(isSubmitting || !isFormValid)
                    .opacity(isFormValid ? 1 : 0.6)
                    .padding(.horizontal, 24)
                    .opacity(animateIn ? 1 : 0)
                    .animation(.easeOut(duration: 0.6).delay(0.3), value: animateIn)

                    // Forgot Password (sign-in only)
                    if !isSignUp {
                        Button {
                            resetEmail = email
                            showForgotPassword = true
                        } label: {
                            Text("Forgot Password?")
                                .font(.caption)
                                .foregroundStyle(GaryColors.lightGold)
                        }
                    }

                    // Divider
                    HStack {
                        Rectangle()
                            .fill(GaryColors.gold.opacity(0.2))
                            .frame(height: 0.5)
                        Text("or continue with")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize()
                        Rectangle()
                            .fill(GaryColors.gold.opacity(0.2))
                            .frame(height: 0.5)
                    }
                    .padding(.horizontal, 24)
                    .opacity(animateIn ? 1 : 0)
                    .animation(.easeOut(duration: 0.6).delay(0.35), value: animateIn)

                    // Social Sign-In Buttons
                    VStack(spacing: 12) {
                        // Apple Sign In
                        AppleSignInButton(authManager: authManager)

                        // Google Sign In
                        SocialSignInButton(
                            title: "Continue with Google",
                            iconName: "g.circle.fill",
                            action: { handleOAuth(provider: .google) }
                        )

                        // Facebook Sign In
                        SocialSignInButton(
                            title: "Continue with Facebook",
                            iconName: "f.circle.fill",
                            action: { handleOAuth(provider: .facebook) }
                        )
                    }
                    .padding(.horizontal, 24)
                    .opacity(animateIn ? 1 : 0)
                    .offset(y: animateIn ? 0 : 30)
                    .animation(.easeOut(duration: 0.6).delay(0.4), value: animateIn)

                    // Toggle Sign In / Sign Up
                    Button {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            isSignUp.toggle()
                            authManager.errorMessage = nil
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(isSignUp ? "Already have an account?" : "Don't have an account?")
                                .foregroundStyle(.secondary)
                            Text(isSignUp ? "Sign In" : "Sign Up")
                                .foregroundStyle(GaryColors.gold)
                                .bold()
                        }
                        .font(.subheadline)
                    }
                    .padding(.top, 8)
                    .opacity(animateIn ? 1 : 0)
                    .animation(.easeOut(duration: 0.6).delay(0.5), value: animateIn)

                    Spacer(minLength: 40)
                }
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.8)) {
                animateIn = true
            }
        }
        .sheet(isPresented: $showForgotPassword) {
            ForgotPasswordSheet(
                email: $resetEmail,
                resetSent: $resetSent,
                isPresented: $showForgotPassword,
                authManager: authManager
            )
        }
    }

    // MARK: - Form Validation

    private var isFormValid: Bool {
        let emailValid = email.contains("@") && email.contains(".")
        let passwordValid = password.count >= 6
        if isSignUp {
            return emailValid && passwordValid && password == confirmPassword
        }
        return emailValid && passwordValid
    }

    // MARK: - Submit

    private func handleSubmit() async {
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            if isSignUp {
                try await authManager.signUp(email: email, password: password)
            } else {
                try await authManager.signIn(email: email, password: password)
            }
        } catch {
            // errorMessage is set by AuthManager
        }
    }

    // MARK: - OAuth

    private func handleOAuth(provider: OAuthProvider) {
        let oauthURL = authManager.oauthURL(provider: provider)
        // Open in ASWebAuthenticationSession
        let session = ASWebAuthenticationSession(
            url: oauthURL,
            callbackURLScheme: "com.gary.app"
        ) { callbackURL, error in
            guard let url = callbackURL, error == nil else { return }
            Task {
                try? await authManager.handleOAuthCallback(url: url)
            }
        }
        session.presentationContextProvider = OAuthPresentationContext.shared
        session.prefersEphemeralWebBrowserSession = false
        session.start()
    }
}

// MARK: - OAuth Presentation Context

final class OAuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = OAuthPresentationContext()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else {
            return ASPresentationAnchor()
        }
        return window
    }
}

// MARK: - Auth Text Field

struct AuthTextField: View {
    let icon: String
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var textContentType: UITextContentType? = nil
    @State private var showPassword = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(GaryColors.gold)
                .frame(width: 20)

            if isSecure && !showPassword {
                SecureField(placeholder, text: $text)
                    .textContentType(textContentType)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
            } else {
                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
                    .textContentType(textContentType)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
            }

            if isSecure {
                Button {
                    showPassword.toggle()
                } label: {
                    Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: "#0D0D0F"))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.2), lineWidth: 0.5)
                )
        )
    }
}

// MARK: - Apple Sign In Button

struct AppleSignInButton: View {
    @ObservedObject var authManager: AuthManager

    var body: some View {
        SignInWithAppleButton(.signIn) { request in
            request.requestedScopes = [.email, .fullName]
        } onCompletion: { result in
            switch result {
            case .success(let authorization):
                if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
                    Task {
                        try? await authManager.signInWithApple(credential: credential)
                    }
                }
            case .failure:
                break
            }
        }
        .signInWithAppleButtonStyle(.white)
        .frame(height: 50)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Social Sign In Button

struct SocialSignInButton: View {
    let title: String
    let iconName: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: iconName)
                    .font(.system(size: 18, weight: .semibold))
                Text(title)
                    .font(.subheadline.bold())
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(hex: "#0D0D0F"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.2), lineWidth: 0.5)
                    )
            )
        }
    }
}

// MARK: - Forgot Password Sheet

struct ForgotPasswordSheet: View {
    @Binding var email: String
    @Binding var resetSent: Bool
    @Binding var isPresented: Bool
    @ObservedObject var authManager: AuthManager
    @State private var isSending = false

    var body: some View {
        ZStack {
            LiquidGlassBackground(accentColor: GaryColors.gold)

            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Image(systemName: "envelope.badge.fill")
                        .foregroundStyle(GaryColors.gold)
                        .font(.title2)
                    Text("Reset Password")
                        .font(.system(size: 22, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundStyle(GaryColors.goldGradient)
                }

                if resetSent {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(GaryColors.gold)

                        Text("Check your email")
                            .font(.headline)
                            .foregroundStyle(.white)

                        Text("We sent a password reset link to \(email)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                } else {
                    Text("Enter your email and we'll send you a link to reset your password.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    AuthTextField(
                        icon: "envelope.fill",
                        placeholder: "Email",
                        text: $email,
                        keyboardType: .emailAddress,
                        textContentType: .emailAddress
                    )
                }

                Button {
                    if resetSent {
                        isPresented = false
                    } else {
                        Task {
                            isSending = true
                            defer { isSending = false }
                            do {
                                try await authManager.resetPassword(email: email)
                                withAnimation { resetSent = true }
                            } catch {
                                // Error handled by AuthManager
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 10) {
                        if isSending {
                            ProgressView().tint(.black)
                        } else {
                            Image(systemName: resetSent ? "checkmark.circle.fill" : "paperplane.fill")
                            Text(resetSent ? "Done" : "Send Reset Link")
                                .font(.headline.bold())
                        }
                    }
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(GaryColors.goldGradient)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .shadow(color: GaryColors.gold.opacity(0.4), radius: 12, y: 6)
                }
                .disabled(isSending || (!resetSent && !email.contains("@")))
            }
            .padding(24)
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}

#Preview {
    AuthView()
        .preferredColorScheme(.dark)
}
