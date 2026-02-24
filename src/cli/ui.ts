const isColorSupported = process.stdout.isTTY && !process.env.NO_COLOR;

const c = {
  reset:   isColorSupported ? '\x1b[0m' : '',
  bold:    isColorSupported ? '\x1b[1m' : '',
  dim:     isColorSupported ? '\x1b[2m' : '',
  italic:  isColorSupported ? '\x1b[3m' : '',
  red:     isColorSupported ? '\x1b[31m' : '',
  green:   isColorSupported ? '\x1b[32m' : '',
  yellow:  isColorSupported ? '\x1b[33m' : '',
  blue:    isColorSupported ? '\x1b[34m' : '',
  magenta: isColorSupported ? '\x1b[35m' : '',
  cyan:    isColorSupported ? '\x1b[36m' : '',
  white:   isColorSupported ? '\x1b[37m' : '',
  gray:    isColorSupported ? '\x1b[90m' : '',
  bgBlack: isColorSupported ? '\x1b[40m' : '',
};

export { c as colors };

const SLOTH_ART = `
${c.green}################################################################################${c.reset}
${c.green}################################################################################${c.reset}
${c.green}################################################################################${c.reset}
${c.green}#########################+. *.   +*#############################################${c.reset}
${c.green}#######################+..-:======+*:-##########################################${c.reset}
${c.green}#####################*.========+###+=+.*########################################${c.reset}
${c.green}####################+-==*#######*:--#=+=########################################${c.reset}
${c.green}##############**+..#+-=#*..=#===-*+:===*-.*#####################################${c.reset}
${c.green}#############**=+***=-=#.==+-  -==#=========+** .*##############################${c.reset}
${c.green}############*******::.-===*+=.:==+*==============++=:+##########################${c.reset}
${c.green}###########************-.--++++++====================+*:-#######################${c.reset}
${c.green}##########=++++***********=-.-- ========================++:#####################${c.reset}
${c.green}############*+ -++++***** **** -=====:=====================+:###################${c.reset}
${c.green}#################* :=+++***** .===== .----------============+=##################${c.reset}
${c.green}######################=:-=++*+.====-=***++-.::-------======== ##################${c.reset}
${c.green}#######################.-=-::::====:*=-:=*****+:.---: -======:##################${c.reset}
${c.green}####################### ---:=+:===-.++********=::+=.:======:.###################${c.reset}
${c.green}####################### ----##.-=---+ -++++*******=-===== =++*+: *##############${c.reset}
${c.green}#######################*:: ###.---.#####*.:=+++***.===:. :+********= =*#########${c.reset}
${c.green}########################- :###+---.##########=:-=+.--:-+****-.=********#########${c.reset}
${c.green}###############################*.  ############-.. :. =++***+*********##########${c.reset}
${c.green}#################################+*#############=::.  +-.=+++*+=:-***###########${c.reset}
${c.green}##########################################################*+ -++++**############${c.reset}
${c.green}################################################################:.=#############${c.reset}
${c.green}################################################################################${c.reset}
${c.green}################################################################################${c.reset}
${c.green}################################################################################${c.reset}

${c.white}${c.bold}                       M E G A S L O T H${c.reset}
${c.dim}                     Rules Every Repos${c.reset}
`;

export function banner(): void {
  console.log(SLOTH_ART);
}

export function heading(text: string): void {
  console.log(`${c.white}${c.bold}  ${text}${c.reset}`);
  console.log('');
}

export function info(msg: string): void {
  console.log(`  ${c.blue}>${c.reset} ${msg}`);
}

export function success(msg: string): void {
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${c.yellow}!${c.reset} ${msg}`);
}

export function fail(msg: string): void {
  console.log(`  ${c.red}✗${c.reset} ${msg}`);
}

export function dim(msg: string): void {
  console.log(`  ${c.dim}${msg}${c.reset}`);
}

export function kv(key: string, value: string, width = 16): void {
  const padded = key.padEnd(width);
  console.log(`  ${c.dim}${padded}${c.reset} ${value}`);
}

export function statusLine(key: string, ok: boolean, label: string, width = 16): void {
  const padded = key.padEnd(width);
  const icon = ok ? `${c.green}●${c.reset}` : `${c.red}○${c.reset}`;
  console.log(`  ${c.dim}${padded}${c.reset} ${icon} ${label}`);
}

export function divider(): void {
  console.log(`${c.dim}  ─────────────────────────────────${c.reset}`);
}

export function blank(): void {
  console.log('');
}

export function hint(msg: string): void {
  console.log(`  ${c.dim}${c.italic}${msg}${c.reset}`);
}

export function cmd(command: string, desc: string): void {
  console.log(`  ${c.cyan}${command.padEnd(28)}${c.reset}${c.dim}${desc}${c.reset}`);
}
