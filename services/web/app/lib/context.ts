import { createContext } from "react-router";
import type { SiteContext } from "./site.server";

export const siteContext = createContext<SiteContext>();
export const nonceContext = createContext<string>();
