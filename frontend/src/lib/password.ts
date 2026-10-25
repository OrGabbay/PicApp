// Same rules as the backend (backend/schemas.py: PASSWORD_MIN_LENGTH, _check_password_strength)
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordMeetsRules(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /\p{L}/u.test(password) &&
    /\p{N}/u.test(password)
  );
}
