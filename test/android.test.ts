import { describe, expect, test } from "bun:test";
import { isAvdName, parseUiAutomatorXml } from "../src/android";
import { androidPackageFor, projectBundleEnv } from "../src/config";

describe("android support", () => {
  test("parses UIAutomator XML into nodes with depth and pixel bounds", () => {
    const xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
      <node index="0" text="" class="android.widget.FrameLayout" package="com.example" bounds="[0,0][1080,2400]">
        <node index="0" text="Sign in &amp; continue" resource-id="com.example:id/cta" class="android.widget.Button" clickable="true" content-desc="" bounds="[40,2000][1040,2140]" />
      </node></hierarchy>`;
    const nodes = parseUiAutomatorXml(xml);
    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toMatchObject({
      depth: 1,
      text: "Sign in & continue",
      resourceId: "com.example:id/cta",
      clickable: true,
      bounds: { x: 40, y: 2000, width: 1000, height: 140 },
    });
  });

  test("accepts AVD names and rejects path-like identifiers", () => {
    expect(isAvdName("Pixel_9_API_35")).toBe(true);
    for (const name of ["../x", "a/b", "", "has space"]) expect(isAvdName(name)).toBe(false);
  });

  test("Android package falls back to the bundle identifier", () => {
    expect(androidPackageFor("debug")).toBe("com.example.fixture.dev");
    expect(androidPackageFor("release")).toBe("com.example.fixture.android");
  });

  test("renders project Metro env templates per lane", () => {
    expect(projectBundleEnv({ environment: "staging", mode: "debug", port: 8201 })).toEqual({
      APP_ENV: "staging",
      METRO_PORT_ECHO: "8201",
      APP_VARIANT: "dev",
    });
  });
});
