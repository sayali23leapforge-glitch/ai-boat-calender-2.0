"use client"

import { useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Loader2, Lock, Mail, Phone, Eye, EyeOff } from "lucide-react"

type Mode = "signIn" | "signUp"

export function EmailAuthForm() {
  const [mode, setMode] = useState<Mode>("signIn")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [isResetting, setIsResetting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const cta = mode === "signIn" ? "Sign in to Cali" : "Create your account"
  const helper =
    mode === "signIn"
      ? "Use your email and password to access your workspace."
      : "Start organizing your calendar with a secure account."

  const passwordHint = useMemo(
    () => (mode === "signUp" ? "Use at least 8 characters with a mix of letters & numbers." : "Enter your account password."),
    [mode],
  )

  // Format phone number to E.164 format
  const formatPhoneE164 = (phoneInput: string): string => {
    // Remove all non-digit characters except leading +
    let cleaned = phoneInput.replace(/[^\d+]/g, '')
    
    // If it starts with +, extract country code and rest
    if (cleaned.startsWith('+')) {
      return '+' + cleaned.slice(1).replace(/\D/g, '')
    }
    
    // Remove any + that's not at the start
    cleaned = cleaned.replace(/\+/g, '')
    
    // If no country code, default to +91 (India)
    // Detect if it might already have a country code:
    // US/Canada: 1 (11 digits total)
    // India: 91 (12 digits total)
    // Most others: 1-3 digit country codes
    
    if (cleaned.length === 10) {
      // Likely a 10-digit number without country code - default to India
      return '+91' + cleaned
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      // Likely US/Canada number
      return '+' + cleaned
    } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
      // Likely Indian number with country code
      return '+' + cleaned
    } else if (cleaned.length > 10) {
      // Assume it already has country code
      return '+' + cleaned
    } else {
      // Short number, default to India
      return '+91' + cleaned
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedEmail = email.trim()
    const trimmedPhone = phone.trim()
    
    if (!trimmedEmail || !password) {
      toast.error("Email and password are required")
      return
    }

    if (mode === "signUp" && !trimmedPhone) {
      toast.error("Phone number is required")
      return
    }

    try {
      setIsSubmitting(true)
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
        if (error) throw error
        toast.success("Welcome back! Redirecting…")
      } else {
        // Sign up with auto-confirm disabled (email confirmation not required)
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}` : undefined,
          },
        })
        if (error) throw error
        
        // If user was created, insert phone into user_profiles
        if (signUpData?.user) {
          try {
            // Format phone to E.164 before saving
            const formattedPhone = formatPhoneE164(trimmedPhone)

            // Update user_profiles with phone for iMessage mapping
            const { error: profileError } = await supabase
              .from('user_profiles')
              .update({
                phone: formattedPhone,
              })
              .eq('user_id', signUpData.user.id)

            if (profileError) {
              const duplicatePhone =
                profileError.code === '23505' ||
                profileError.message?.toLowerCase().includes('duplicate') ||
                profileError.message?.toLowerCase().includes('unique')

              if (duplicatePhone) {
                toast.error("That phone number is already registered. Please use a different number.")
                await supabase.auth.signOut({ scope: "local" })
                return
              }

              console.error('Error updating phone in profile:', profileError)
            }

            // Auto-login after signup
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password,
            })
            if (!signInError) {
              toast.success("Welcome! Account created and logged in.")
            } else {
              // Email confirmation might be required - user needs to confirm email
              toast.success("Account created! Please check your email to confirm and sign in.")
            }
          } catch (signInErr) {
            // Email confirmation might be required - user needs to confirm email
            toast.success("Account created! Please check your email to confirm and sign in.")
          }
        }
      }
    } catch (error) {
      const message = parseAuthError(error)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = resetEmail.trim()
    if (!trimmed) {
      toast.error("Please enter the email you used to sign up.")
      return
    }

    try {
      setIsResetting(true)
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/reset` : undefined
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo })
      if (error) throw error
      toast.success("Reset link sent! Check your inbox for further instructions.")
      setIsResetOpen(false)
      setResetEmail("")
    } catch (error) {
      toast.error(parseAuthError(error))
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <>
      <Card className="max-w-md w-full border-border/80 shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold">{cta}</CardTitle>
          <CardDescription>{helper}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-2 rounded-full bg-muted p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("signIn")}
              className={`rounded-full py-2 transition ${mode === "signIn" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signUp")}
              className={`rounded-full py-2 transition ${mode === "signUp" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              Create account
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pl-10 pr-10"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{passwordHint}</p>
            </div>
            {mode === "signUp" && (
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">Your phone number for iMessage integration.</p>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating…
                </span>
              ) : mode === "signIn" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <div className="text-sm flex flex-col items-center gap-2 text-muted-foreground">
            {mode === "signIn" ? (
              <>
                Need an account?{" "}
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => setMode("signUp")}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => setMode("signIn")}
                >
                  Sign in instead
                </button>
              </>
            )}
            {mode === "signIn" && (
              <button
                type="button"
                onClick={() => setIsResetOpen(true)}
                className="text-xs text-primary/80 hover:text-primary hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>Enter your account email and we&apos;ll send you a secure reset link.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleForgotPassword}>
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setIsResetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isResetting}>
                {isResetting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </span>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function parseAuthError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: string }).message)
    if (message.includes("Invalid login credentials")) return "Invalid email or password."
    if (message.includes("Email not confirmed")) return "Please confirm your email before signing in."
    return message
  }
  return "Authentication failed. Please try again."
}

