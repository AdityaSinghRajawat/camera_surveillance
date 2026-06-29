import { User } from '../models';

/** Data access for users. Sequelize queries ONLY — no business logic. */
export const usersRepository = {
  findById(id: string): Promise<User | null> {
    return User.findByPk(id);
  },

  findByUsername(username: string): Promise<User | null> {
    return User.findOne({ where: { username } });
  },

  create(data: { username: string; passwordHash: string }): Promise<User> {
    return User.create(data);
  },
};
