// lib/joinCode.ts
import { customAlphabet } from "nanoid";

const nano = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 7);
export const makeJoinCode = () => nano();
