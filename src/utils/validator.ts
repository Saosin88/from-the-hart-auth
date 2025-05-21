export const PASSWORD_PATTERNS = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
};

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PasswordValidationResult {
  isValid: boolean;
  errors: {
    minLength?: boolean;
    hasUppercase?: boolean;
    hasLowercase?: boolean;
    hasNumber?: boolean;
    hasSpecialChar?: boolean;
  };
}

interface EmailValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateEmail(email: string): EmailValidationResult {
  if (!email) {
    return {
      isValid: false,
      error: "Email is required",
    };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return {
      isValid: false,
      error: "Invalid email format",
    };
  }

  return {
    isValid: true,
  };
}

export function validatePassword(password: string): PasswordValidationResult {
  const result: PasswordValidationResult = {
    isValid: true,
    errors: {},
  };

  if (!password || password.length < PASSWORD_PATTERNS.minLength) {
    result.isValid = false;
    result.errors.minLength = true;
  }

  if (!PASSWORD_PATTERNS.hasUppercase.test(password)) {
    result.isValid = false;
    result.errors.hasUppercase = true;
  }

  if (!PASSWORD_PATTERNS.hasLowercase.test(password)) {
    result.isValid = false;
    result.errors.hasLowercase = true;
  }

  if (!PASSWORD_PATTERNS.hasNumber.test(password)) {
    result.isValid = false;
    result.errors.hasNumber = true;
  }

  if (!PASSWORD_PATTERNS.hasSpecialChar.test(password)) {
    result.isValid = false;
    result.errors.hasSpecialChar = true;
  }

  return result;
}

export function getPasswordErrorMessage(
  errors: PasswordValidationResult["errors"]
): string {
  const requirements: string[] = [];

  if (errors.minLength) {
    requirements.push(
      `be at least ${PASSWORD_PATTERNS.minLength} characters long`
    );
  }

  if (errors.hasUppercase) {
    requirements.push("have at least one uppercase letter");
  }

  if (errors.hasLowercase) {
    requirements.push("have at least one lowercase letter");
  }

  if (errors.hasNumber) {
    requirements.push("have at least one number");
  }

  if (errors.hasSpecialChar) {
    requirements.push("have at least one special character");
  }

  if (requirements.length === 0) {
    return "Password does not meet security requirements";
  }

  return `Password must ${requirements.join(", ")}`;
}
