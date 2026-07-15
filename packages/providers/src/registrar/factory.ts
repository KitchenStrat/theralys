import { MockRegistrar } from "./mock";
import { OvhRegistrar } from "./ovh";
import type { RegistrarProvider } from "./types";

export function resolveRegistrarMode(env: NodeJS.ProcessEnv = process.env): "ovh" | "mock" {
  return env.OVH_APP_KEY && env.OVH_APP_SECRET && env.OVH_CONSUMER_KEY ? "ovh" : "mock";
}

export function createRegistrar(env: NodeJS.ProcessEnv = process.env): RegistrarProvider {
  return resolveRegistrarMode(env) === "ovh"
    ? new OvhRegistrar({
        appKey: env.OVH_APP_KEY!,
        appSecret: env.OVH_APP_SECRET!,
        consumerKey: env.OVH_CONSUMER_KEY!,
      })
    : new MockRegistrar();
}
