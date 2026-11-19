// mcp_can.h (Cory Fowler's library), the parts most sketches use:
//   MCP_CAN CAN0(10);  CAN0.begin(MCP_ANY, CAN_500KBPS, MCP_8MHZ) == CAN_OK;  CAN0.setMode(MCP_NORMAL);
//   byte data[8] = {...};  CAN0.sendMsgBuf(0x100, 0, 8, data);   (0 = standard id, 1 = extended)
//   if (CAN0.checkReceive() == CAN_MSGAVAIL) { CAN0.readMsgBuf(&rxId, &len, rxBuf); }
//   (or watch the module's INT pin: LOW while a message waits)
const CAN_OK = 0, CAN_FAILINIT = 1, CAN_FAILTX = 2, CAN_MSGAVAIL = 3, CAN_NOMSG = 4, CAN_CTRLERROR = 5, CAN_GETTXBFTIMEOUT = 6, CAN_SENDMSGTIMEOUT = 7, CAN_FAIL = 0xff;
const MCP_ANY = 0, MCP_STD = 1, MCP_EXT = 2, MCP_STDEXT = 3;
const MCP_NORMAL = 0x00, MCP_SLEEP = 0x20, MCP_LOOPBACK = 0x40, MCP_LISTENONLY = 0x60;
const MCP_8MHZ = 8, MCP_16MHZ = 16, MCP_20MHZ = 20;
const CAN_5KBPS = 5, CAN_10KBPS = 10, CAN_20KBPS = 20, CAN_50KBPS = 50, CAN_100KBPS = 100, CAN_125KBPS = 125, CAN_250KBPS = 250, CAN_500KBPS = 500, CAN_1000KBPS = 1000;
class MCP_CAN {
  constructor(cs = 10) { this.cs = cs; this.ok = false; }
  _x(bytes) { digitalWrite(this.cs, LOW); const r = SPI.transfer(bytes.slice()); digitalWrite(this.cs, HIGH); return r; }
  begin(idmode, speed, clock) {
    pinMode(this.cs, OUTPUT); digitalWrite(this.cs, HIGH);
    SPI.begin();
    const r = this._x([0xc0, Math.round(Number(speed) / 5) & 255, Number(clock) & 255, 0]);
    this.ok = r[1] === 0x55;
    return this.ok ? CAN_OK : CAN_FAILINIT;
  }
  setMode(m) { this._x([0xc4, m & 255]); return CAN_OK; }
  init_Mask() { return CAN_OK; } init_Filt() { return CAN_OK; }
  sendMsgBuf(id, ext, len, buf) {
    if (buf === undefined) { buf = len; len = ext; ext = id > 0x7ff ? 1 : 0; } // (sendMsgBuf(id, len, buf))
    if (!this.ok) return CAN_FAILTX;
    const n = Math.max(0, Math.min(8, len | 0));
    const data = [];
    for (let i = 0; i < n; i++) data.push((typeof buf[i] === 'string' ? buf[i].charCodeAt(0) : Number(buf[i] ?? 0)) & 255);
    const v = Number(id) >>> 0;
    this._x([0xc1, ext ? 1 : 0, (v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255, n, ...data]);
    return CAN_OK;
  }
  checkReceive() { return this.ok && this._x([0xc2, 0])[1] ? CAN_MSGAVAIL : CAN_NOMSG; }
  readMsgBuf(id, len, buf) {
    const r = this._x([0xc3, ...new Array(15).fill(0)]);
    const n = r[6];
    const v = ((r[2] << 24) >>> 0) + (r[3] << 16) + (r[4] << 8) + r[5];
    // (as the real library: an extended id comes back with bit 31 set)
    const full = r[1] ? (v | 0x80000000) >>> 0 : v;
    if (isRef(id)) id.value = full;
    if (isRef(len)) len.value = n;
    for (let i = 0; i < n && buf && i < 8; i++) buf[i] = r[7 + i];
    return n ? CAN_OK : CAN_NOMSG;
  }
  checkError() { return CAN_OK; }
  getError() { return 0; }
}
