from pathlib import Path
import re
base = Path(__file__).resolve().parents[1]
page = base / 'site' / 'peiliao.html'
html = page.read_text(encoding='utf-8')
html = re.sub(r'function sendToCalc\(dateStr,items,sig\)\{.*?\n\}\n', '', html, flags=re.S)
html = html.replace('生产汇总 + 发送到配比计算', '生产汇总（只读）').replace('生成订单号 YYYYMMDD-001', '正式订单号由服务器统一分配')
html = html.replace('或前往「订单 → 生产汇总 → 发送到配比计算」', '再点击「计算今日配料」')
html = html.replace("var orderTab='today';      // 'today' | 'all'", "var orderTab='today';      // 'today' | 'tomorrow' | 'all'")
html = html.replace('实际生产总数量', '产品总数量').replace('// 载入已保存计划（保留手动调整）', '// 历史计划保留在数据中，当前汇总只读展示订单数量')
page.write_text(html, encoding='utf-8')
