import { v4 as uuidv4 } from 'uuid';

/** ID único (funciona no Android, iOS e web com polyfill no entry). */
export function createId(): string {
  return uuidv4();
}
