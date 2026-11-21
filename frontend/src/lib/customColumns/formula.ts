/**
 * Formula text to tree and back. Columns are written in square brackets by label, e.g.
 * `[TMDB score] / ([Budget] / 1000000)`. Operators are `+ - * /` with normal precedence and
 * left associativity; functions are `log10 sqrt zscore min max coalesce`. Nothing is evaluated
 * as code: the parser builds the tree directly.
 */
import { OPERANDS, findOperandByLabel, type Operand } from './operands';
import {
	FN_ARITY,
	formulaShapeError,
	isConstNode,
	isOpNode,
	isOperandNode,
	type FnName,
	type FormulaNode,
} from './types';

export type ParseResult = { tree: FormulaNode } | { error: string; suggestions?: string[] };

type Token =
	| { kind: 'num'; value: number; at: number }
	| { kind: 'col'; name: string; at: number }
	| { kind: 'ident'; name: string; at: number }
	| { kind: 'punct'; text: '+' | '-' | '*' | '/' | '(' | ')' | ','; at: number };

/** A plain-language parse failure. Raised internally and turned into a ParseResult. */
class FormulaError extends Error {
	constructor(
		message: string,
		readonly suggestions?: string[],
	) {
		super(message);
	}
}

const NUMBER_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const PUNCT = '+-*/(),';

function lex(text: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		if (ch === '[') {
			const close = text.indexOf(']', i + 1);
			if (close === -1) {
				throw new FormulaError('A column name starts with [ but has no closing ]. Add the ] after the column name.');
			}
			const name = text.slice(i + 1, close).trim();
			if (name === '') throw new FormulaError('There is an empty [] with no column name between the brackets.');
			if (name.includes('[')) throw new FormulaError('A column name cannot contain [. Check the brackets.');
			tokens.push({ kind: 'col', name, at: i });
			i = close + 1;
			continue;
		}
		const num = NUMBER_RE.exec(text.slice(i));
		if (num) {
			tokens.push({ kind: 'num', value: Number(num[0]), at: i });
			i += num[0].length;
			continue;
		}
		const ident = IDENT_RE.exec(text.slice(i));
		if (ident) {
			tokens.push({ kind: 'ident', name: ident[0], at: i });
			i += ident[0].length;
			continue;
		}
		if (PUNCT.includes(ch)) {
			tokens.push({ kind: 'punct', text: ch as '+', at: i });
			i++;
			continue;
		}
		throw new FormulaError(`I don't understand "${ch}" at position ${i + 1}.`);
	}
	return tokens;
}

function editDistance(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		prev = row;
	}
	return prev[b.length];
}

/**
 * How well a typed column name matches an operand: 0 for an exact label or alias, 1 for a
 * substring of one, 2 + distance for a near miss; null when nothing is close enough.
 */
function matchScore(query: string, operand: Operand): number | null {
	const names = [operand.label, ...operand.aliases].map((n) => n.toLowerCase());
	if (names.includes(query)) return 0;
	if (query.length >= 3 && names.some((n) => n.length >= 3 && (n.includes(query) || query.includes(n)))) return 1;
	const distance = Math.min(...names.map((n) => editDistance(query, n)));
	return distance <= Math.max(2, Math.ceil(query.length / 3)) ? 2 + distance : null;
}

/** The two closest column labels to a typed name; ties keep catalogue order. */
export function suggestColumns(name: string, operands: readonly Operand[]): string[] {
	const query = name.trim().toLowerCase();
	return operands
		.map((operand, index) => ({ operand, index, score: matchScore(query, operand) }))
		.filter((m): m is { operand: Operand; index: number; score: number } => m.score !== null)
		.sort((a, b) => a.score - b.score || a.index - b.index)
		.slice(0, 2)
		.map((m) => m.operand.label);
}

const BINARY_OPS: Record<string, 'add' | 'sub' | 'mul' | 'div'> = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' };

class Parser {
	private pos = 0;

	constructor(
		private readonly tokens: Token[],
		private readonly operands: readonly Operand[],
	) {}

	parse(): FormulaNode {
		const node = this.sum();
		const rest = this.peek();
		if (rest) {
			if (isPunct(rest, ')'))
				throw new FormulaError("There's a ) with no matching (. Remove it or add the ( it belongs to.");
			throw new FormulaError(`I didn't expect "${describe(rest)}" here.`);
		}
		return node;
	}

	private peek(): Token | undefined {
		return this.tokens[this.pos];
	}

	private next(): Token | undefined {
		return this.tokens[this.pos++];
	}

	private sum(): FormulaNode {
		let left = this.product();
		while (isPunct(this.peek(), '+') || isPunct(this.peek(), '-')) {
			const op = BINARY_OPS[(this.next() as { text: string }).text];
			left = { op, args: [left, this.product()] };
		}
		return left;
	}

	private product(): FormulaNode {
		let left = this.primary();
		while (isPunct(this.peek(), '*') || isPunct(this.peek(), '/')) {
			const op = BINARY_OPS[(this.next() as { text: string }).text];
			left = { op, args: [left, this.primary()] };
		}
		return left;
	}

	private primary(): FormulaNode {
		const token = this.next();
		if (!token) throw new FormulaError('The formula stops early. Finish the last part.');
		switch (token.kind) {
			case 'num':
				return { const: token.value };
			case 'col':
				return { operand: this.resolveColumn(token.name) };
			case 'ident':
				return this.call(token.name);
			case 'punct':
				if (token.text === '(') {
					const inner = this.sum();
					if (!isPunct(this.next(), ')')) {
						throw new FormulaError("There's an ( with no matching ). Add the missing ) after its part.");
					}
					return inner;
				}
				if (token.text === '-' && this.peek()?.kind === 'num') {
					return { const: -(this.next() as { value: number }).value };
				}
				if (token.text === '-') {
					throw new FormulaError('A minus sign must come right before a number, like -5.');
				}
				throw new FormulaError(`I expected a number, a [column] or a function here, but found "${token.text}".`);
		}
	}

	private resolveColumn(name: string): string {
		const found = findOperandByLabel(name, this.operands);
		if (found) return found.key;
		const suggestions = suggestColumns(name, this.operands);
		const message =
			suggestions.length === 0
				? `There's no column called [${name}].`
				: suggestions.length === 1
					? `There's no column called [${name}]. Did you mean [${suggestions[0]}]?`
					: `There's no column called [${name}]. Did you mean [${suggestions[0]}] or [${suggestions[1]}]?`;
		throw new FormulaError(message, suggestions);
	}

	private call(name: string): FormulaNode {
		const op = name.toLowerCase();
		if (!Object.hasOwn(FN_ARITY, op)) {
			throw new FormulaError(
				`There's no function called ${name}. The functions are log10, sqrt, zscore, min, max and coalesce.`,
			);
		}
		if (!isPunct(this.peek(), '(')) {
			throw new FormulaError(`Put column names in square brackets, like [${name}].`);
		}
		this.next();
		const args: FormulaNode[] = [];
		if (!isPunct(this.peek(), ')')) {
			args.push(this.sum());
			while (isPunct(this.peek(), ',')) {
				this.next();
				args.push(this.sum());
			}
		}
		if (!isPunct(this.next(), ')')) {
			throw new FormulaError(`There's a ${name}( with no matching ). Add the missing ) after its values.`);
		}
		return { op: op as FnName, args };
	}
}

function isPunct(token: Token | undefined, text: string): boolean {
	return token?.kind === 'punct' && token.text === text;
}

function describe(token: Token): string {
	switch (token.kind) {
		case 'num':
			return String(token.value);
		case 'col':
			return `[${token.name}]`;
		case 'ident':
			return token.name;
		case 'punct':
			return token.text;
	}
}

/**
 * Parses formula text into a tree, or a plain-language error. Unknown columns come back with the
 * two closest labels as `suggestions`.
 */
export function parseFormula(text: string, operands: readonly Operand[] = OPERANDS): ParseResult {
	if (text.trim() === '') {
		return { error: 'Type a formula first, for example [TMDB score] / ([Budget] / 1000000).' };
	}
	try {
		const tree = new Parser(lex(text), operands).parse();
		const shapeError = formulaShapeError(tree);
		return shapeError ? { error: shapeError } : { tree };
	} catch (err) {
		if (err instanceof FormulaError) {
			return err.suggestions ? { error: err.message, suggestions: err.suggestions } : { error: err.message };
		}
		throw err;
	}
}

const PRECEDENCE: Record<'add' | 'sub' | 'mul' | 'div', number> = { add: 1, sub: 1, mul: 2, div: 2 };
const SYMBOL: Record<'add' | 'sub' | 'mul' | 'div', string> = { add: '+', sub: '-', mul: '*', div: '/' };

/** Prints a tree in formula syntax. `print(parse(x))` is canonical; parentheses appear only where precedence needs them. */
export function printFormula(tree: FormulaNode, operands: readonly Operand[] = OPERANDS): string {
	const labels = new Map(operands.map((o) => [o.key, o.label]));

	const print = (node: FormulaNode, parent?: { prec: number; right: boolean }): string => {
		if (isOperandNode(node)) return `[${labels.get(node.operand) ?? node.operand}]`;
		if (isConstNode(node)) {
			const text = String(node.const);
			return node.const < 0 ? `(${text})` : text;
		}
		if (isOpNode(node) && node.op in PRECEDENCE && node.args.length === 2) {
			const op = node.op as 'add' | 'sub' | 'mul' | 'div';
			const prec = PRECEDENCE[op];
			const body = node.args.map((arg, i) => print(arg, { prec, right: i > 0 })).join(` ${SYMBOL[op]} `);
			const needsParens = parent !== undefined && (prec < parent.prec || (prec === parent.prec && parent.right));
			return needsParens ? `(${body})` : body;
		}
		if (isOpNode(node)) {
			return `${node.op}(${node.args.map((arg) => print(arg)).join(', ')})`;
		}
		return '';
	};

	return print(tree);
}
