'use strict';

const net = require('node:net');

class CommandValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommandValidationError';
    this.code = 'INVALID_NFTATO_ARGUMENT';
    this.status = 400;
  }
}

const shellQuote = value => `'${String(value).replaceAll("'", `'"'"'`)}'`;
const fail = message => { throw new CommandValidationError(message); };
const integer = (value, name, min, max) => {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) fail(`${name}必须是整数`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) fail(`${name}必须在${min}-${max}之间`);
  return String(parsed);
};
const ports = value => {
  const text = String(value ?? '').trim();
  if (!text || text.length > 1024) fail('端口参数无效');
  const segments = text.split(',').map(segment => segment.trim());
  return segments.map(segment => {
    const match = segment.match(/^(\d{1,5})(?:[:-](\d{1,5}))?$/);
    if (!match) fail('端口格式无效');
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end > 65535 || start > end) fail('端口必须在1-65535之间且范围有效');
    return start === end ? String(start) : `${start}-${end}`;
  }).join(',');
};
const ip = value => {
  const text = String(value ?? '').trim();
  const [address, prefix, extra] = text.split('/');
  const family = net.isIP(address);
  if (!family || extra !== undefined) fail('IP地址格式无效');
  if (prefix !== undefined) integer(prefix, 'CIDR前缀', 0, family === 4 ? 32 : 128);
  return prefix === undefined ? address : `${address}/${Number(prefix)}`;
};
const ipList = value => {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  if (!values.length || values.length > 256) fail('IP列表无效');
  return values.map(ip).join(',');
};
const keyword = value => {
  const text = String(value ?? '').trim();
  if (!text || text.length > 256 || /[\u0000-\u001f\u007f]/u.test(text)) fail('关键词包含无效字符');
  return text;
};
const noArgs = value => {
  if (value !== undefined && value !== null && String(value).trim()) fail('该操作不接受参数');
  return [];
};
const one = validator => value => [validator(value)];

const definitions = [
  [0, 'outbound:list', true, noArgs], [1, 'outbound:block-bt', false, noArgs],
  [2, 'outbound:block-spam', false, noArgs], [3, 'outbound:block-all', false, noArgs],
  [4, 'outbound:block-ports', false, one(ports)], [5, 'outbound:block-keyword', false, one(keyword)],
  [6, 'outbound:unblock-bt', false, noArgs], [7, 'outbound:unblock-spam', false, noArgs],
  [8, 'outbound:unblock-all', false, noArgs], [9, 'outbound:unblock-ports', false, one(ports)],
  [10, 'outbound:unblock-keyword', false, one(keyword)], [11, 'outbound:unblock-keywords', false, noArgs],
  [12, 'outbound:blocklists', false, noArgs], [13, 'inbound:list-ports', true, noArgs],
  [14, 'inbound:list-addresses', true, noArgs], [15, 'inbound:allow-ports', false, one(ports)],
  [16, 'inbound:remove-ports', false, one(ports)], [17, 'inbound:allow-addresses', false, one(ipList)],
  [18, 'inbound:remove-addresses', false, one(ipList)], [19, 'ssh:port', true, noArgs],
  [20, 'rules:rebuild', false, noArgs], [21, 'self:update', false, noArgs],
  [22, 'ddos:setup', false, noArgs],
  [23, 'ddos:custom-port', false, value => {
    const values = Array.isArray(value) ? value : String(value ?? '').trim().split(/\s+/);
    if (values.length !== 6) fail('自定义端口防御需要6个参数');
    return [integer(values[0], '端口', 1, 65535), integer(values[1], '协议类型', 1, 3),
      integer(values[2], '最大连接数', 1, 1000000), integer(values[3], '每分钟速率', 1, 1000000),
      integer(values[4], '每秒速率', 1, 1000000), integer(values[5], '封禁小时', 1, 87600)];
  }],
  [24, 'ddos:ip-list', false, value => {
    const values = Array.isArray(value) ? value : String(value ?? '').trim().split(/\s+/);
    if (values.length < 2 || values.length > 3) fail('IP名单操作参数无效');
    const action = integer(values[0], '操作类型', 1, 4);
    const normalizedIp = ip(values[1]);
    const args = [action, normalizedIp];
    if (values[2] !== undefined && values[2] !== '') args.push(integer(values[2], '有效期', 0, 87600));
    return args;
  }],
  [25, 'ddos:status', true, noArgs]
].map(([legacyCode, commandName, readOnly, validate]) => ({ legacyCode, commandName, readOnly, validate }));

const byCode = new Map(definitions.map(definition => [String(definition.legacyCode), definition]));
const byName = new Map(definitions.map(definition => [definition.commandName, definition]));

function resolveCommand(action, rawArguments) {
  const definition = byCode.get(String(action)) || byName.get(String(action));
  if (!definition) fail('未知的Nftato操作');
  const args = definition.validate(rawArguments);
  return { ...definition, args };
}

function buildCommand(scriptPath, action, rawArguments) {
  const resolved = resolveCommand(action, rawArguments);
  const command = ['bash', shellQuote(scriptPath), String(resolved.legacyCode), ...resolved.args.map(shellQuote)].join(' ');
  return { ...resolved, command };
}

function buildStructuredCommand(scriptPath, action, rawArguments) {
  const resolved = resolveCommand(action, rawArguments);
  const command = ['bash', shellQuote(scriptPath), '--json', shellQuote(resolved.commandName), ...resolved.args.map(shellQuote)].join(' ');
  return { ...resolved, command };
}

module.exports = { definitions, resolveCommand, buildCommand, buildStructuredCommand, shellQuote, CommandValidationError };
