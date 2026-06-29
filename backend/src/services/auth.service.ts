import { usersRepository } from '../repositories/users.repository';
import { hashPassword, verifyPassword } from '../utils/password.util';
import { signToken } from '../utils/jwt.util';
import { serializeUser, type SerializedUser } from '../serializers/users.serializer';
import { AppError } from '../utils/appError.util';
import type { SignupInput, LoginInput } from '../validations/auth.validation';

export interface AuthResult {
  user: SerializedUser;
  token: string;
}

/** Business logic for authentication (CONTRACTS §4.1). */
export const authService = {
  async signup(input: SignupInput): Promise<AuthResult> {
    const existing = await usersRepository.findByUsername(input.username);
    if (existing) {
      throw AppError.conflict('Username is already taken');
    }
    const passwordHash = await hashPassword(input.password);
    const user = await usersRepository.create({ username: input.username, passwordHash });
    const token = await signToken(user.id, user.username);
    return { user: serializeUser(user), token };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await usersRepository.findByUsername(input.username);
    // Constant-ish failure path: same error whether user missing or bad password.
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw AppError.unauthorized('Invalid username or password');
    }
    const token = await signToken(user.id, user.username);
    return { user: serializeUser(user), token };
  },

  async getById(userId: string): Promise<SerializedUser> {
    const user = await usersRepository.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    return serializeUser(user);
  },
};
