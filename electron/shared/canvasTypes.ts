import { z } from "zod";

// JSON Canvas 1.0 spec — https://jsoncanvas.org/spec/1.0/
//
// Color may be a hex string (e.g. "#FF0000") or a preset id "1"–"6".
// We accept any string here and let renderers decide; the spec leaves room
// for future presets so we stay permissive on validation.
export type CanvasColor = string;

const ColorSchema = z.string();

const NodeBase = {
	id: z.string(),
	x: z.number().int(),
	y: z.number().int(),
	width: z.number().int(),
	height: z.number().int(),
	color: ColorSchema.optional(),
};

export const CanvasTextNodeSchema = z
	.object({
		...NodeBase,
		type: z.literal("text"),
		text: z.string(),
	})
	.passthrough();

export const CanvasFileNodeSchema = z
	.object({
		...NodeBase,
		type: z.literal("file"),
		file: z.string(),
		subpath: z.string().optional(),
	})
	.passthrough();

export const CanvasLinkNodeSchema = z
	.object({
		...NodeBase,
		type: z.literal("link"),
		url: z.string(),
	})
	.passthrough();

export const CanvasGroupNodeSchema = z
	.object({
		...NodeBase,
		type: z.literal("group"),
		label: z.string().optional(),
		background: z.string().optional(),
		backgroundStyle: z.enum(["cover", "ratio", "repeat"]).optional(),
	})
	.passthrough();

export const CanvasNodeSchema = z.discriminatedUnion("type", [
	CanvasTextNodeSchema,
	CanvasFileNodeSchema,
	CanvasLinkNodeSchema,
	CanvasGroupNodeSchema,
]);

export const CanvasEdgeSchema = z
	.object({
		id: z.string(),
		fromNode: z.string(),
		fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
		fromEnd: z.enum(["none", "arrow"]).default("none"),
		toNode: z.string(),
		toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
		toEnd: z.enum(["none", "arrow"]).default("arrow"),
		color: ColorSchema.optional(),
		label: z.string().optional(),
	})
	.passthrough();

export const CanvasDataSchema = z
	.object({
		nodes: z.array(CanvasNodeSchema).optional().default([]),
		edges: z.array(CanvasEdgeSchema).optional().default([]),
	})
	.passthrough();

export type CanvasTextNode = z.infer<typeof CanvasTextNodeSchema>;
export type CanvasFileNode = z.infer<typeof CanvasFileNodeSchema>;
export type CanvasLinkNode = z.infer<typeof CanvasLinkNodeSchema>;
export type CanvasGroupNode = z.infer<typeof CanvasGroupNodeSchema>;
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;
export type CanvasData = z.infer<typeof CanvasDataSchema>;

export function parseCanvas(raw: string): CanvasData {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return CanvasDataSchema.parse({});
	}
	let json: unknown;
	try {
		json = JSON.parse(trimmed);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid JSON in .canvas file: ${msg}`);
	}
	return CanvasDataSchema.parse(json);
}
