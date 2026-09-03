// DeeYoung Pro — pocket analysis over baseline campaign trades.
// Question: do ANY measurable entry conditions show gross (pre-cost) edge
// large enough to survive 22bps round-trip costs? The DATA picks the upgrade.

interface Trade {
  gate: number; horizon: number; symbol: string; signalScore: number;
  entryT: number; entry: number; stop: number; target: number;
  exitT: number; exit: number; reason: string;
  grossPct: number; netPct: number; rMultiple: number;
  factors: { name: string; contribution: number }[];
}

const trades: Trade[] = await Bun.file(new URL("./out/campaign-trades.json", import.meta.url).pathname).json();

function f(t: Trade, name: string): number {
  return t.factors.find((x) => x.name === name)?.contribution ?? 0;
}

function report(label: string, groups: Record<string, Trade[]>) {
  console.log(`\n── ${label} ──`);
  for (const [k, ts] of Object.entries(groups)) {
    if (!ts.length) { console.log(`  ${k}: n=0`); continue; }
    const n = ts.length;
    const win = ts.filter((t) => t.grossPct > 0).length;
    const avgGross = ts.reduce((a, t) => a + t.grossPct, 0) / n;
    const avgNet = ts.reduce((a, t) => a + t.netPct, 0) / n;
    const gw = ts.filter((t) => t.grossPct > 0).reduce((a, t) => a + t.grossPct, 0);
    const gl = Math.abs(ts.filter((t) => t.grossPct <= 0).reduce((a, t) => a + t.grossPct, 0));
    const pf = gl > 0 ? (gw / gl).toFixed(2) : "inf";
    console.log(`  ${k}: n=${n} winRate=${(win / n * 100).toFixed(1)}% avgGross=${avgGross.toFixed(3)}% avgNet=${avgNet.toFixed(3)}% PF=${pf}`);
  }
}

for (const h of [10, 30]) {
  const H = trades.filter((t) => t.horizon === h && t.gate === 65); // widest book = most data
  console.log(`\n=================== HORIZON ${h}m (gate 65 book, n=${H.length}) ===================`);

  report("Score bucket", {
    "65-69": H.filter((t) => t.signalScore < 70),
    "70-74": H.filter((t) => t.signalScore >= 70 && t.signalScore < 75),
    "75+": H.filter((t) => t.signalScore >= 75),
  });

  report("Bollinger position at entry (chase guard test)", {
    "stretched(pos>0.9, contrib<0)": H.filter((t) => f(t, "Bollinger Stretch") < 0),
    "upper-half(0.55-0.9)": H.filter((t) => f(t, "Bollinger Stretch") > 0),
    "mid/low(contrib=0)": H.filter((t) => f(t, "Bollinger Stretch") === 0),
  });

  report("VWAP distance (extension test)", {
    "far above (>10)": H.filter((t) => f(t, "VWAP") > 10),
    "moderate (5-10)": H.filter((t) => f(t, "VWAP") > 5 && f(t, "VWAP") <= 10),
    "close (0-5)": H.filter((t) => f(t, "VWAP") > 0 && f(t, "VWAP") <= 5),
    "below VWAP (<=0)": H.filter((t) => f(t, "VWAP") <= 0),
  });

  report("ROC (momentum chase test)", {
    "hot (>5)": H.filter((t) => f(t, "Rate of Change") > 5),
    "warm (2-5)": H.filter((t) => f(t, "Rate of Change") > 2 && f(t, "Rate of Change") <= 5),
    "cool (0-2)": H.filter((t) => f(t, "Rate of Change") > 0 && f(t, "Rate of Change") <= 2),
    "neg (<=0)": H.filter((t) => f(t, "Rate of Change") <= 0),
  });

  report("Volume confirmation", {
    "strong (>=7)": H.filter((t) => f(t, "Volume") >= 7),
    "mild (4.4-7)": H.filter((t) => f(t, "Volume") >= 4.4 && f(t, "Volume") < 7),
    "thin (<4.4)": H.filter((t) => f(t, "Volume") < 4.4),
  });

  report("MACD state", {
    "bull expanding (14)": H.filter((t) => f(t, "MACD") >= 13),
    "bull decel (7.7-13)": H.filter((t) => f(t, "MACD") >= 7 && f(t, "MACD") < 13),
    "bear (<=0)": H.filter((t) => f(t, "MACD") <= 0),
  });

  report("EMA structure strength", {
    "full 18": H.filter((t) => f(t, "EMA Structure") >= 17),
    "partial (5-17)": H.filter((t) => f(t, "EMA Structure") >= 5 && f(t, "EMA Structure") < 17),
    "mixed (<5)": H.filter((t) => f(t, "EMA Structure") < 5),
  });

  // hour-of-day (UTC) — crypto liquidity windows
  const byHour: Record<number, Trade[]> = {};
  for (const t of H) { const hr = new Date(t.entryT).getUTCHours(); (byHour[hr] ??= []).push(t); }
  const rows = Object.entries(byHour).map(([hr, ts]) => {
    const avgGross = ts.reduce((a, t) => a + t.grossPct, 0) / ts.length;
    return { hr: Number(hr), n: ts.length, avgGross: +avgGross.toFixed(3) };
  }).sort((a, b) => b.avgGross - a.avgGross);
  console.log("\n── hour-of-day (UTC) best/worst by avgGross ──");
  console.log("  best:", rows.slice(0, 4).map((r) => `${r.hr}h(n=${r.n},${r.avgGross}%)`).join(" "));
  console.log("  worst:", rows.slice(-4).map((r) => `${r.hr}h(n=${r.n},${r.avgGross}%)`).join(" "));
}
console.log("\nPOCKETS_DONE");
