// Dev-only stand-in for the Rust backend so the UI can be previewed in a plain browser.
import type { Game, GamesPayload, RunInfo } from "./api";

const names = [
  "Where Winds Meet", "NTE: Neverness to Everness", "ARKNIGHTS: ENDFIELD", "Call of Duty: Modern Warfare 4", "Once Human",
  "Resident Evil Requiem", "Nekome: Nazi Hunter", "EA Sports FC 27", "Counter-Strike 2", "Dota 2", "Valorant", "Fortnite",
  "War Thunder", "Cyberpunk 2077", "Squad", "Half-Life: Alyx", "NieR:Automata", "Haste", "PAYDAY 2", "PRAGMATA",
  "Genshin Impact", "Honkai: Star Rail", "Zenless Zone Zero", "Minecraft", "Roblox", "Apex Legends", "Rust", "Terraria",
  "Stardew Valley", "Hades II", "Elden Ring", "Baldur's Gate 3", "Palworld", "Helldivers 2", "Warframe", "Destiny 2",
  "Rocket League", "Overwatch 2", "League of Legends", "Path of Exile 2", "Lethal Company", "Content Warning", "Phasmophobia",
  "Black Myth: Wukong", "Hollow Knight: Silksong", "Schedule I", "R.E.P.O.", "Peak", "Mouthwashing", "Balatro",
];

const games: Game[] = names.map((name, i) => ({
  id: String(1000 + i),
  name,
  icon: null,
  cover: null,
  exes: i === 7 ? [] : [{ name: name.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".exe", launcher: false }, ...(i % 4 === 0 ? [{ name: "launcher.exe", launcher: true }] : [])],
}));

// a few real Discord ids so icons and covers can be previewed
const real: Record<string, [string, string, string]> = {
  "Where Winds Meet": ["1437509662303059998", "54b48542501564ce5e9837f7fa3171a5", "14adf4179a6f1f7d6c5f0bd2f925d030"],
  "Call of Duty: Modern Warfare 4": ["1511443377927880775", "cd03f4a5ad670a01f554c6a2832e2db7", "b84dc72f3c50792e031f4ee8337452ee"],
  "Once Human": ["1260340082150346932", "ec8a566bcaad1d21e45e728e1307ab1a", "18535f5756286c51c7ba28b12d70fb13"],
  "Cyberpunk 2077": ["787443973538971748", "023b9ec72cd60e31e25bca878c77984a", "f4fcdc6c261a90bab370c0368f27c30c"],
  Roblox: ["363445589247131668", "f2b60e350a2097289b3b0b877495e55f", "82f092687242e81976b955927df9cd24"],
};
for (const g of games) {
  const r = real[g.name];
  if (r) [g.id, g.icon, g.cover] = r;
}

let running: RunInfo[] = [];

export async function mockInvoke(cmd: string, args: any = {}): Promise<any> {
  await new Promise((r) => setTimeout(r, 120));
  switch (cmd) {
    case "get_games":
    case "refresh_games":
      return { games, fetchedMs: Date.now() - 3600_000, addedCount: 0, added: [], gained: [] } satisfies GamesPayload;
    case "launch": {
      const info: RunInfo = { key: `${args.gameId}|${args.exe}`, gameId: args.gameId, gameName: args.gameName, exe: args.exe, pid: 4242 + running.length, startedMs: Date.now(), durationS: args.minutes * 60 };
      running = [...running.filter((r) => r.key !== info.key), info];
      return info;
    }
    case "stop":
      running = running.filter((r) => r.key !== args.key);
      return;
    case "stop_all":
      running = [];
      return;
    case "list_running":
      return running;
    case "discord_running":
      return true;
    case "app_info":
      return { version: "dev", portable: false, dataDir: "C:\\Users\\you\\AppData\\Local\\app.decoy.desktop" };
    case "find_installed":
      return args.exes?.[0]?.startsWith("where") ? "Z:\\Steam\\steamapps\\common\\Where Winds Meet" : null;
    default:
      return;
  }
}
