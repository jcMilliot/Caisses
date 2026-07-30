import { call } from "./client";

export interface UserStatus {
  configured: boolean;
  trigramme: string | null;
}

export const userApi = {
  getUserStatus: () => call<UserStatus>("get_user_status"),
  setTrigramme: (trigramme: string) => call<void>("set_trigramme", { trigramme }),
};
