//+------------------------------------------------------------------+
//|                                              QuantEdgeBridge.mq4 |
//|        Own-bridge client for DeeYoung Pro / QuantEdge Terminal   |
//|                       Works with ANY MT4 broker                  |
//+------------------------------------------------------------------+
#property copyright "DeeYoung Pro"
#property version   "1.00"
#property description "Connects your MetaTrader 4 terminal to your DeeYoung Pro broker link."
#property description "The EA polls your private command queue, executes orders locally on"
#property description "this terminal, and reports the fills back. No third-party service is"
#property description "involved and your account password never leaves this terminal."
#property strict

input string  ServerURL     = "https://YOUR-DEPLOYMENT-URL"; // Site URL (from Settings > Broker)
input string  BridgeToken   = "";                            // Bridge key (Settings > Broker, shown once)
input int     PollSeconds   = 5;                             // Poll interval, seconds (3-60)
input double  LotsOverride  = 0;                             // Override lot size (0 = use the site setting)
input int     SlippagePts   = 30;                            // Max slippage, points
input bool    VerboseLog    = true;                          // Verbose journal logging

int     g_magic       = 860426;   // overwritten by the server at handshake
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
   return StrToDouble(s);
  }

bool JsonGetBool(const string json, const string key)
  {
   string s = JsonGetString(json, key, "false");
   return (s == "true" || s == "1");
  }

string Sanitize(string s)
  {
   StringReplace(s, "\"", "'");
   StringReplace(s, "\\", "/");
   StringReplace(s, "\n", " ");
   StringReplace(s, "\r", " ");
   return s;
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
   char post[];
   char result[];
   StringToCharArray(body, post, 0, StringLen(body));
   ResetLastError();
   int code = WebRequest("POST", url, headers, 10000, post, result);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4060)
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
   if(MarketInfo(wanted, MODE_POINT) > 0 || SymbolSelect(wanted, true)) return wanted;
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
   double minv = MarketInfo(sym, MODE_MINLOT);
   double maxv = MarketInfo(sym, MODE_MAXLOT);
   double step = MarketInfo(sym, MODE_LOTSTEP);
   if(step > 0) lots = MathFloor(lots / step + 0.0000001) * step;
   if(lots < minv) lots = minv;
   if(lots > maxv) lots = maxv;
   return NormalizeDouble(lots, 2);
  }

//+------------------------------------------------------------------+
//| Find this EA's order ticket among open orders                    |
//+------------------------------------------------------------------+
int FindOpenTicket(const string ticketStr, const string brokerSym)
  {
   int want = (int)StrToInteger(ticketStr);
   if(want > 0 && OrderSelect(want, SELECT_BY_TICKET, MODE_TRADES) && OrderCloseTime() == 0) return want;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != g_magic) continue;
      if(OrderType() > OP_SELL) continue; // market orders only
      if(brokerSym != "" && OrderSymbol() != brokerSym) continue;
      return OrderTicket();
     }
   return 0;
  }

//+------------------------------------------------------------------+
//| Execute one command; fill the report row                         |
//+------------------------------------------------------------------+
void ExecuteCommand(const string cmd, bool &ok, bool &unsupported, string &ticket, double &price, double &volume, string &message)
  {
   ok = false; unsupported = false; ticket = "0"; price = 0; volume = 0; message = "";

   if(!IsTradeAllowed())
     {
      message = "AutoTrading is disabled in this terminal. Enable it and the EA will execute new commands.";
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

   RefreshRates();

   if(action == "CLOSE")
     {
      int pos = FindOpenTicket(refTk, sym);
      if(pos == 0) { message = "No open order found for " + sym + " (ticket " + refTk + ")."; unsupported = true; return; }
      if(!OrderSelect(pos, SELECT_BY_TICKET, MODE_TRADES)) { message = "Could not select order " + refTk + "."; return; }
      double cprice = (OrderType() == OP_BUY) ? MarketInfo(sym, MODE_BID) : MarketInfo(sym, MODE_ASK);
      if(OrderClose(pos, OrderLots(), cprice, SlippagePts, clrNONE))
        {
         ok = true;
         ticket = IntegerToString(pos);
         price = cprice;
         message = "Order " + ticket + " closed on your terminal.";
        }
      else message = "OrderClose failed (" + IntegerToString(GetLastError()) + ").";
      return;
     }

   // OPEN
   double useLots = (LotsOverride > 0) ? LotsOverride : lots;
   useLots = NormalizeLots(sym, useLots);
   double px = (side == "BUY") ? MarketInfo(sym, MODE_ASK) : MarketInfo(sym, MODE_BID);
   int cmdType = (side == "BUY") ? OP_BUY : OP_SELL;
   int t = OrderSend(sym, cmdType, useLots, px, SlippagePts, sl, tp, "QuantEdge", g_magic, 0, clrNONE);
   if(t <= 0)
     {
      int err = GetLastError();
      // Retry once without SL/TP if the broker rejected the stops (common on
      // strict stop-level brokers). The site still holds the levels.
      if(err == 130 || err == 4107)
        {
         RefreshRates();
         px = (side == "BUY") ? MarketInfo(sym, MODE_ASK) : MarketInfo(sym, MODE_BID);
         t = OrderSend(sym, cmdType, useLots, px, SlippagePts, 0, 0, "QuantEdge", g_magic, 0, clrNONE);
         if(t > 0) { sl = 0; tp = 0; }
         else message = "OrderSend failed (" + IntegerToString(GetLastError()) + "), stops removed and retried.";
        }
      if(t <= 0)
        {
         if(message == "") message = "OrderSend failed (" + IntegerToString(err) + ").";
         return;
        }
     }
   ok = true;
   ticket = IntegerToString(t);
   if(OrderSelect(t, SELECT_BY_TICKET, MODE_TRADES))
     {
      price = OrderOpenPrice();
      volume = OrderLots();
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
      string hb = "{\"platform\":\"MT4\",\"server\":\"" + Sanitize(AccountServer()) +
                  "\",\"login\":\"" + IntegerToString(AccountNumber()) +
                  "\",\"currency\":\"" + AccountCurrency() +
                  "\",\"balance\":" + DoubleToString(AccountBalance(), 2) +
                  ",\"equity\":" + DoubleToString(AccountEquity(), 2) +
                  ",\"version\":\"1.00\"}";
      if(PostJson("/api/bridge/handshake", hb, hs) && JsonGetBool(hs, "ok"))
        {
         g_magic = (int)JsonGetDouble(hs, "magic", 860426);
         g_heartbeat = (int)MathMax(3, MathMin(60, JsonGetDouble(hs, "heartbeatSec", 5)));
         g_handshaken = true;
         g_lastNote = "connected";
         if(VerboseLog) Print("QuantEdge bridge: handshake ok, magic=", g_magic);
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
   string pb = "{\"balance\":" + DoubleToString(AccountBalance(), 2) +
               ",\"equity\":" + DoubleToString(AccountEquity(), 2) + "}";
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
               DoubleToString(AccountBalance(), 2) + ",\"equity\":" +
               DoubleToString(AccountEquity(), 2) + "}", rr);
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
           "  |  account ", AccountNumber(),
           "  |  magic ", g_magic);
  }
