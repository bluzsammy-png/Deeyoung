//+------------------------------------------------------------------+
//|                                              QuantEdgeBridge.mq5 |
//|        Own-bridge client for DeeYoung Pro / QuantEdge Terminal   |
//|                       Works with ANY MT5 broker (Deriv, IC, ...) |
//+------------------------------------------------------------------+
#property copyright "DeeYoung Pro"
#property version   "1.00"
#property description "Connects your MetaTrader 5 terminal to your DeeYoung Pro broker link."
#property description "The EA polls your private command queue, executes orders locally on"
#property description "this terminal, and reports the fills back. No third-party service is"
#property description "involved and your account password never leaves this terminal."
#property strict

#include <Trade\Trade.mqh>

input string  ServerURL     = "https://YOUR-DEPLOYMENT-URL"; // Site URL (from Settings > Broker)
input string  BridgeToken   = "";                            // Bridge key (Settings > Broker, shown once)
input int     PollSeconds   = 5;                             // Poll interval, seconds (3-60)
input double  LotsOverride  = 0;                             // Override lot size (0 = use the site setting)
input int     SlippagePts   = 30;                            // Max slippage, points
input bool    VerboseLog    = true;                          // Verbose journal logging

CTrade  trade;
long    g_magic       = 860426;   // overwritten by the server at handshake
int     g_heartbeat   = 5;
bool    g_handshaken  = false;
string  g_lastNote    = "starting";

//+------------------------------------------------------------------+
//| Small JSON readers (server payloads are flat and known)          |
//+------------------------------------------------------------------+
string JsonGetString(const string json, const string key, const string def = "")
  {
   string pat = "\"" + key + "\"";
   int p = StringFind(json, pat);
   if(p < 0) return def;
   p = StringFind(json, ":", p + StringLen(pat));
   if(p < 0) return def;
   p++;
   int len = StringLen(json);
   while(p < len && StringGetCharacter(json, p) == ' ') p++;
   if(p < len && StringGetCharacter(json, p) == '"')
     {
      int q = StringFind(json, "\"", p + 1);
      if(q < 0) return def;
      return StringSubstr(json, p + 1, q - p - 1);
     }
   int e1 = StringFind(json, ",", p);
   int e2 = StringFind(json, "}", p);
   int e = (e1 < 0) ? e2 : ((e2 < 0) ? e1 : MathMin(e1, e2));
   if(e < 0) return def;
   return StringSubstr(json, p, e - p);
  }

double JsonGetDouble(const string json, const string key, const double def = 0.0)
  {
   string s = JsonGetString(json, key, "");
   if(s == "" || s == "null") return def;
   return StringToDouble(s);
  }

bool JsonGetBool(const string json, const string key)
  {
   string s = JsonGetString(json, key, "false");
   return (s == "true" || s == "1");
  }

string Sanitize(const string s)
  {
   string out = s;
   StringReplace(out, "\"", "'");
   StringReplace(out, "\\", "/");
   StringReplace(out, "\n", " ");
   StringReplace(out, "\r", " ");
   return out;
  }

//+------------------------------------------------------------------+
//| Split the commands array into top-level JSON objects             |
//+------------------------------------------------------------------+
int SplitCommandObjects(const string resp, string &objects[])
  {
   ArrayResize(objects, 0);
   int arr = StringFind(resp, "[");
   if(arr < 0) return 0;
   int depth = 0, start = -1;
   int total = StringLen(resp);
   for(int i = arr; i < total; i++)
     {
      ushort c = StringGetCharacter(resp, i);
      if(c == '{') { if(depth == 0) start = i; depth++; }
      else if(c == '}')
        {
         depth--;
         if(depth == 0 && start >= 0)
           {
            int n = ArraySize(objects);
            ArrayResize(objects, n + 1);
            objects[n] = StringSubstr(resp, start, i - start + 1);
            start = -1;
           }
        }
      else if(c == ']' && depth == 0) break;
     }
   return ArraySize(objects);
  }

//+------------------------------------------------------------------+
//| HTTP POST with the bridge token header                          |
//+------------------------------------------------------------------+
bool PostJson(const string path, const string body, string &response)
  {
   response = "";
   string url = ServerURL;
   if(StringLen(url) > 0 && StringGetCharacter(url, StringLen(url) - 1) == '/')
      url = StringSubstr(url, 0, StringLen(url) - 1);
   url += path;
   string headers = "Content-Type: application/json\r\nX-Bridge-Token: " + BridgeToken + "\r\n";
   char post[], result[];
   string rh;
   StringToCharArray(body, post, 0, StringLen(body));
   ResetLastError();
   int code = WebRequest("POST", url, headers, 10000, post, result, rh);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         Print("QuantEdge bridge: add ", ServerURL, " to Tools > Options > Expert Advisors > Allow WebRequest for listed URL");
      g_lastNote = "WebRequest failed (" + IntegerToString(err) + ")";
      return false;
     }
   response = CharArrayToString(result);
   return (code >= 200 && code < 300);
  }

//+------------------------------------------------------------------+
//| Map an engine symbol (SOLUSD) to this broker's symbol name       |
//+------------------------------------------------------------------+
string ResolveSymbol(const string wanted)
  {
   if(wanted == "") return "";
   if(SymbolSelect(wanted, true)) return wanted;
   int total = SymbolsTotal(false);
   for(int i = 0; i < total; i++)
     {
      string name = SymbolName(i, false);
      if(StringLen(name) > StringLen(wanted) && StringFind(name, wanted) == 0)
        {
         if(SymbolSelect(name, true)) return name;
        }
     }
   for(int i = 0; i < total; i++)
     {
      string name = SymbolName(i, false);
      if(StringFind(name, wanted) >= 0)
        {
         if(SymbolSelect(name, true)) return name;
        }
     }
   return "";
  }

double NormalizeLots(const string sym, double lots)
  {
   double minv = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double maxv = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   if(step > 0) lots = MathFloor(lots / step + 0.0000001) * step;
   if(lots < minv) lots = minv;
   if(lots > maxv) lots = maxv;
   return NormalizeDouble(lots, 2);
  }

//+------------------------------------------------------------------+
//| Find this EA's position ticket (by ticket, else magic + symbol)  |
//+------------------------------------------------------------------+
long FindPosition(const string ticketStr, const string brokerSym)
  {
   long want = StringToInteger(ticketStr);
   if(want > 0 && PositionSelectByTicket((ulong)want)) return want;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != g_magic) continue;
      if(brokerSym != "" && PositionGetString(POSITION_SYMBOL) != brokerSym) continue;
      return (long)t;
     }
   return 0;
  }

//+------------------------------------------------------------------+
//| Execute one command; fill the report row                         |
//+------------------------------------------------------------------+
void ExecuteCommand(const string cmd, bool &ok, bool &unsupported, string &ticket, double &price, double &volume, string &message)
  {
   ok = false; unsupported = false; ticket = "0"; price = 0; volume = 0; message = "";

   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
     {
      message = "AutoTrading is disabled in this terminal. Enable Algo Trading and the EA will retry new commands.";
      return;
     }

   string action = JsonGetString(cmd, "action");
   string wanted = JsonGetString(cmd, "symbol");
   string side   = JsonGetString(cmd, "side");
   double lots   = JsonGetDouble(cmd, "lots", 0.01);
   double sl     = JsonGetDouble(cmd, "sl", 0);
   double tp     = JsonGetDouble(cmd, "tp", 0);
   string refTk  = JsonGetString(cmd, "ticket", "0");

   if(action != "OPEN" && action != "CLOSE") { message = "Unknown action " + action; return; }

   string sym = ResolveSymbol(wanted);
   if(sym == "") { message = "Symbol " + wanted + " is not listed by this broker."; unsupported = true; return; }

   if(StringLen(BridgeToken) == 0) { message = "Bridge key missing."; return; }

   trade.SetExpertMagicNumber(g_magic);
   trade.SetDeviationInPoints((ulong)SlippagePts);
   trade.SetTypeFillingBySymbol(sym);

   if(action == "CLOSE")
     {
      long pos = FindPosition(refTk, sym);
      if(pos == 0) { message = "No open position found for " + sym + " (ticket " + refTk + ")."; unsupported = true; return; }
      if(trade.PositionClose((ulong)pos, (ulong)SlippagePts))
        {
         ok = true;
         ticket = IntegerToString(pos);
         volume = 0; // the position is gone; the server records the close price only
         price = SymbolInfoDouble(sym, (side == "SELL") ? SYMBOL_BID : SYMBOL_ASK);
         message = "Position " + ticket + " closed on your terminal.";
        }
      else message = "PositionClose failed: " + IntegerToString(trade.ResultRetcode()) + " " + trade.ResultRetcodeDescription();
      return;
     }

   // OPEN
   double useLots = (LotsOverride > 0) ? LotsOverride : lots;
   useLots = NormalizeLots(sym, useLots);
   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double px = (side == "BUY") ? ask : bid;
   double slUse = (sl > 0) ? NormalizeDouble(sl, digits) : 0;
   double tpUse = (tp > 0) ? NormalizeDouble(tp, digits) : 0;
   string comment = "QuantEdge " + StringSubstr(JsonGetString(cmd, "id", ""), 0, 8);

   bool sent = (side == "BUY")
               ? trade.Buy(useLots, sym, px, slUse, tpUse, comment)
               : trade.Sell(useLots, sym, px, slUse, tpUse, comment);

   if(!sent || (trade.ResultRetcode() != TRADE_RETCODE_DONE && trade.ResultRetcode() != TRADE_RETCODE_PLACED))
     {
      message = "OrderSend failed: " + IntegerToString(trade.ResultRetcode()) + " " + trade.ResultRetcodeDescription();
      return;
     }

   // Confirm the position exists (netting and hedging safe).
   ulong found = 0;
   for(int tries = 0; tries < 10 && found == 0; tries++)
     {
      Sleep(200);
      for(int i = PositionsTotal() - 1; i >= 0 && found == 0; i--)
        {
         ulong t = PositionGetTicket(i);
         if(t == 0) continue;
         if(PositionGetInteger(POSITION_MAGIC) != g_magic) continue;
         if(PositionGetString(POSITION_SYMBOL) != sym) continue;
         found = t;
        }
     }
   if(found == 0)
     {
      message = "The broker accepted the order (" + IntegerToString((long)trade.ResultOrder()) + ") but no position appeared yet.";
      return;
     }
   ok = true;
   ticket = IntegerToString((long)found);
   if(PositionSelectByTicket(found))
     {
      price = PositionGetDouble(POSITION_PRICE_OPEN);
      volume = PositionGetDouble(POSITION_VOLUME);
     }
   message = "Filled " + DoubleToString(useLots, 2) + " lots " + sym + " on your terminal.";
  }

//+------------------------------------------------------------------+
//| Handshake + poll + report cycle                                  |
//+------------------------------------------------------------------+
void TickBridge()
  {
   if(StringLen(BridgeToken) == 0 || StringLen(ServerURL) == 0 || StringFind(ServerURL, "YOUR-DEPLOYMENT") >= 0)
     {
      g_lastNote = "fill ServerURL and BridgeToken in EA inputs";
      return;
     }

   if(!g_handshaken)
     {
      string hs;
      string hb = "{\"platform\":\"MT5\",\"server\":\"" + Sanitize(AccountInfoString(ACCOUNT_SERVER)) +
                  "\",\"login\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) +
                  "\",\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) +
                  "\",\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
                  ",\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
                  ",\"version\":\"1.00\"}";
      if(PostJson("/api/bridge/handshake", hb, hs) && JsonGetBool(hs, "ok"))
        {
         g_magic = (long)JsonGetDouble(hs, "magic", 860426);
         g_heartbeat = (int)MathMax(3, MathMin(60, JsonGetDouble(hs, "heartbeatSec", 5)));
         g_handshaken = true;
         g_lastNote = "connected";
         if(VerboseLog) Print("QuantEdge bridge: handshake ok, magic=", g_magic, " heartbeat=", g_heartbeat, "s");
        }
      else
        {
         g_lastNote = "handshake failed: " + hs;
         if(VerboseLog) Print("QuantEdge bridge: ", g_lastNote);
        }
      return;
     }

   // Poll
   string pr;
   string pb = "{\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
               ",\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "}";
   if(!PostJson("/api/bridge/poll", pb, pr))
     {
      g_lastNote = "poll failed";
      return;
     }
   string cmds[];
   int n = SplitCommandObjects(pr, cmds);

   string results = "";
   int reported = 0;
   for(int i = 0; i < n; i++)
     {
      bool ok; bool unsup; string ticket; double price; double volume; string message;
      string id = JsonGetString(cmds[i], "id");
      ExecuteCommand(cmds[i], ok, unsup, ticket, price, volume, message);
      if(VerboseLog) Print("QuantEdge bridge cmd ", id, " -> ok=", ok, " ", message);
      if(reported > 0) results += ",";
      results += "{\"id\":\"" + id + "\",\"ok\":" + (ok ? "true" : "false") +
                 ",\"unsupported\":" + (unsup ? "true" : "false") +
                 ",\"ticket\":\"" + ticket + "\"" +
                 ",\"price\":" + DoubleToString(price, 8) +
                 ",\"volume\":" + DoubleToString(volume, 2) +
                 ",\"message\":\"" + Sanitize(message) + "\"}";
      reported++;
     }

   if(reported > 0)
     {
      string rr;
      PostJson("/api/bridge/report", "{\"results\":[" + results + "],\"balance\":" +
               DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",\"equity\":" +
               DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "}", rr);
     }
   g_lastNote = (n > 0) ? ("executed " + IntegerToString(n) + " command(s)") : "idle, connected";
  }

//+------------------------------------------------------------------+
//| Expert init/deinit/timer                                         |
//+------------------------------------------------------------------+
int OnInit()
  {
   EventSetTimer(MathMax(3, MathMin(60, PollSeconds)));
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

void OnTimer()
  {
   TickBridge();
   Comment("QuantEdge bridge: ", g_lastNote,
           "  |  account ", AccountInfoInteger(ACCOUNT_LOGIN),
           "  |  magic ", g_magic);
  }
