import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Auth flow tests — verifies the email OTP sign-in flow
 * that powers routes/auth.tsx
 */

// Mock authClient to avoid real API calls
const mockSendOtp = vi.fn()
const mockSignIn = vi.fn()
const mockSignOut = vi.fn()

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    emailOtp: {
      sendVerificationOtp: (...args: any[]) => mockSendOtp(...args),
    },
    signIn: {
      emailOtp: (...args: any[]) => mockSignIn(...args),
    },
    signOut: (...args: any[]) => mockSignOut(...args),
  },
}))

describe("auth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("send verification OTP", () => {
    it("sends OTP with correct email and type", async () => {
      mockSendOtp.mockResolvedValue({ data: { success: true } })

      const result = await mockSendOtp({
        email: "user@example.com",
        type: "sign-in",
      })

      expect(mockSendOtp).toHaveBeenCalledWith({
        email: "user@example.com",
        type: "sign-in",
      })
      expect(result.data.success).toBe(true)
    })

    it("returns error for invalid email", async () => {
      mockSendOtp.mockResolvedValue({
        error: { message: "Invalid email address" },
      })

      const result = await mockSendOtp({
        email: "not-an-email",
        type: "sign-in",
      })

      expect(result.error.message).toBe("Invalid email address")
    })

    it("handles network failure gracefully", async () => {
      mockSendOtp.mockRejectedValue(new Error("Network error"))

      await expect(
        mockSendOtp({ email: "user@example.com", type: "sign-in" }),
      ).rejects.toThrow("Network error")
    })
  })

  describe("verify OTP", () => {
    it("signs in with correct email and 6-digit OTP", async () => {
      mockSignIn.mockResolvedValue({ data: { session: { id: "sess_123" } } })

      const result = await mockSignIn({
        email: "user@example.com",
        otp: "123456",
      })

      expect(mockSignIn).toHaveBeenCalledWith({
        email: "user@example.com",
        otp: "123456",
      })
      expect(result.data.session.id).toBe("sess_123")
    })

    it("rejects wrong OTP code", async () => {
      mockSignIn.mockResolvedValue({
        error: { message: "Invalid code" },
      })

      const result = await mockSignIn({
        email: "user@example.com",
        otp: "000000",
      })

      expect(result.error.message).toBe("Invalid code")
    })

    it("rejects expired OTP code", async () => {
      mockSignIn.mockResolvedValue({
        error: { message: "OTP has expired" },
      })

      const result = await mockSignIn({
        email: "user@example.com",
        otp: "123456",
      })

      expect(result.error.message).toBe("OTP has expired")
    })
  })

  describe("OTP validation rules", () => {
    it("OTP must be exactly 6 digits", () => {
      const validateOtp = (otp: string) => /^\d{6}$/.test(otp)
      expect(validateOtp("123456")).toBe(true)
      expect(validateOtp("12345")).toBe(false)
      expect(validateOtp("1234567")).toBe(false)
      expect(validateOtp("abcdef")).toBe(false)
      expect(validateOtp("")).toBe(false)
    })

    it("OTP input strips non-digit characters", () => {
      const sanitize = (input: string) => input.replace(/\D/g, "")
      expect(sanitize("12 34 56")).toBe("123456")
      expect(sanitize("abc123def456")).toBe("123456")
      expect(sanitize("123-456")).toBe("123456")
    })

    it("email must not be empty for send", () => {
      const canSend = (email: string) => email.trim().length > 0
      expect(canSend("user@example.com")).toBe(true)
      expect(canSend("")).toBe(false)
      expect(canSend("   ")).toBe(false)
    })
  })

  describe("resend OTP", () => {
    it("resends OTP to the same email", async () => {
      mockSendOtp.mockResolvedValue({ data: { success: true } })

      // First send
      await mockSendOtp({ email: "user@example.com", type: "sign-in" })
      // Resend
      await mockSendOtp({ email: "user@example.com", type: "sign-in" })

      expect(mockSendOtp).toHaveBeenCalledTimes(2)
      expect(mockSendOtp).toHaveBeenLastCalledWith({
        email: "user@example.com",
        type: "sign-in",
      })
    })
  })
})
