/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "./schema";

export const convexModules = import.meta.glob("./**/*.ts");

export function makeConvexTest() {
  return convexTest(schema, convexModules);
}
