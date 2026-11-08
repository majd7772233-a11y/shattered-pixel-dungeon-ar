import { describe, expect, it, vi } from "vitest";
import worker, { MatchRoom } from "./index";
import type { Env } from "./protocol/types";

describe("Worker compatibility entry", () => {
  it("keeps the canonical MatchRoom class available from the root facade", () => {
    expect(typeof MatchRoom).toBe("function");
  });

  it("routes a room request to the named Durable Object and forwards the same request", async () => {
    const roomId = { name: "deep-dungeon" };
    const roomResponse = new Response("room response", { status: 202 });
    const roomFetch = vi.fn().mockResolvedValue(roomResponse);
    const idFromName = vi.fn((roomCode: string) => {
      expect(roomCode).toBe("deep-dungeon");
      return roomId;
    });
    const get = vi.fn((_id: unknown) => ({ fetch: roomFetch }));
    const env = { MATCH_ROOM: { idFromName, get } } as unknown as Env;
    const request = new Request("https://worker.example/room/deep-dungeon/websocket?protocol=1");

    const response = await worker.fetch(request, env);

    expect(idFromName).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(roomId);
    expect(roomFetch).toHaveBeenCalledOnce();
    expect(roomFetch).toHaveBeenCalledWith(request);
    expect(response).toBe(roomResponse);
  });

  it("uses DEFAULT_ROOM when the room-code segment is empty", async () => {
    const roomId = { name: "DEFAULT_ROOM" };
    const roomFetch = vi.fn().mockResolvedValue(new Response("default room"));
    const idFromName = vi.fn((roomCode: string) => {
      expect(roomCode).toBe("DEFAULT_ROOM");
      return roomId;
    });
    const get = vi.fn(() => ({ fetch: roomFetch }));
    const env = { MATCH_ROOM: { idFromName, get } } as unknown as Env;

    await worker.fetch(new Request("https://worker.example/room//websocket"), env);

    expect(idFromName).toHaveBeenCalledWith("DEFAULT_ROOM");
    expect(roomFetch).toHaveBeenCalledOnce();
  });

  it("returns the existing API information response outside room paths", async () => {
    const response = await worker.fetch(
      new Request("https://worker.example/"),
      {} as Env
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "SPD Multiplayer Server API. Access /room/{roomCode}/websocket to connect."
    );
  });
});
