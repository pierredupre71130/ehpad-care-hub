export type UserRole =
  | 'admin'
  | 'cadre'
  | 'psychologue'
  | 'dieteticienne'
  | 'aide-soignante'
  | 'as'
  | 'ide';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  display_name?: string;
}