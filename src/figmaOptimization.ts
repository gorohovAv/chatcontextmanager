import * as fs from 'fs/promises';

// ============================================================
// CONFIGURATION
// ============================================================
const BLACKLIST = new Set([
    'id', 'guid', 'pluginData', 'sharedPluginData',
    'scrollBehavior', 'isFixed', 'absoluteBoundingBox',
    'absoluteRenderBounds', 'constraints', 'layoutAlign',
    'layoutGrow', 'boundVariables', 'componentPropertyReferences',
    'componentProperties', 'componentPropertyDefinitions',
    'fillGeometry', 'strokeGeometry', 'effects',
    'blendMode', 'preserveRatio', 'exportSettings',
    'relativeTransform', 'size', 'minWidth', 'maxWidth',
    'minHeight', 'maxHeight', 'clipsContent',
    'background', 'itemSpacing', 'counterAxisSpacing',
    'layoutPositioning', 'layoutSizingHorizontal',
    'layoutSizingVertical', 'overflowDirection',
]);

const TYPE_MAP: Record<string, string> = {
    'DOCUMENT': 'root',
    'CANVAS': 'page',
    'FRAME': 'div',
    'GROUP': 'div',
    'SECTION': 'section',
    'COMPONENT': 'component',
    'COMPONENT_SET': 'component-set',
    'INSTANCE': 'instance',
    'TEXT': 'text',
    'RECTANGLE': 'rect',
    'ELLIPSE': 'ellipse',
    'LINE': 'line',
    'VECTOR': 'icon',
    'BOOLEAN_OPERATION': 'icon',
    'IMAGE': 'img',
};

// ============================================================
// UTILITIES
// ============================================================
function simplifyFills(fills: any[]): string | null {
    if (!Array.isArray(fills) || fills.length === 0) return null;
    const solid = fills.find((f: any) => f.visible !== false && f.type === 'SOLID');
    if (!solid?.color) return null;
    const { r, g, b } = solid.color;
    const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function simplifyFont(font: any): string | null {
    if (!font?.family) return null;
    return font.style ? `${font.family} ${font.style}` : font.family;
}

// ============================================================
// NODE PROCESSING
// ============================================================
interface ProcessedNode {
    tag: string;
    label?: string;
    text?: string;
    props: Record<string, any>;
    children: ProcessedNode[];
}

function processNode(node: any): ProcessedNode | null {
    if (!node || typeof node !== 'object') return null;
    
    const tag = TYPE_MAP[node.type] || node.type?.toLowerCase() || 'unknown';
    const label = node.name || undefined;
    const text = node.characters || undefined;
    const props: Record<string, any> = {};
    const children: ProcessedNode[] = [];
    
    // Process properties
    for (const [key, value] of Object.entries(node)) {
        if (BLACKLIST.has(key)) continue;
        if (key === 'type' || key === 'name' || key === 'characters' || key === 'children') continue;
        
        // Simplify fills
        if (key === 'fills' && Array.isArray(value)) {
            const hex = simplifyFills(value);
            if (hex) props.bg = hex;
            continue;
        }
        
        // Simplify strokes
        if (key === 'strokes' && Array.isArray(value)) {
            const hex = simplifyFills(value);
            if (hex) props.border = hex;
            continue;
        }
        
        // Simplify font
        if (key === 'fontName') {
            const font = simplifyFont(value);
            if (font) props.font = font;
            continue;
        }
        
        // Map common properties
        const propMap: Record<string, string> = {
            'fontSize': 'size',
            'fontWeight': 'weight',
            'cornerRadius': 'radius',
            'rectangleCornerRadii': 'radii',
            'paddingLeft': 'pl',
            'paddingRight': 'pr',
            'paddingTop': 'pt',
            'paddingBottom': 'pb',
            'primaryAxisAlignItems': 'justify',
            'counterAxisAlignItems': 'align',
            'layoutMode': 'flex',
            'opacity': 'opacity',
            'rotation': 'rotate',
        };
        
        const propName = propMap[key] || key;
        
        // Skip default/empty values
        if (value === null || value === undefined || value === '') continue;
        if (Array.isArray(value) && value.length === 0) continue;
        if (typeof value === 'object' && Object.keys(value).length === 0) continue;
        
        props[propName] = value;
    }
    
    // Process children
    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            const processed = processNode(child);
            if (processed) {
                children.push(processed);
            }
        }
    }
    
    return { tag, label, text, props, children };
}

// ============================================================
// MARKDOWN GENERATION
// ============================================================
function nodeToMarkdown(node: ProcessedNode, depth: number = 0): string {
    const indent = '  '.repeat(depth);
    let line = `${indent}${node.tag}`;
    
    if (node.label) {
        line += ` "${node.label}"`;
    }
    
    // Add text content
    if (node.text) {
        line += `: "${node.text}"`;
    }
    
    // Add properties
    const propEntries = Object.entries(node.props);
    if (propEntries.length > 0) {
        const propsStr = propEntries
            .map(([k, v]) => {
                if (typeof v === 'string') return `${k}="${v}"`;
                if (Array.isArray(v)) return `${k}=[${v.join(',')}]`;
                return `${k}=${v}`;
            })
            .join(' ');
        line += ` ${propsStr}`;
    }
    
    let result = line + '\n';
    
    // Process children
    for (const child of node.children) {
        result += nodeToMarkdown(child, depth + 1);
    }
    
    return result;
}

// ============================================================
// MAIN EXPORT
// ============================================================
export async function optimizeFigmaJsonToJsonPath(
    jsonPath: string,
    outputPath: string
): Promise<{ success: boolean; message: string; stats?: any }> {
    try {
        // Read JSON
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        const jsonData = JSON.parse(jsonContent);
        
        // Process document
        if (!jsonData.document) {
            return { success: false, message: 'Invalid Figma JSON: no document field' };
        }
        
        const processed = processNode(jsonData.document);
        if (!processed) {
            return { success: false, message: 'Failed to process document' };
        }
        
        // Generate Markdown
        const markdown = nodeToMarkdown(processed);
        
        // Add header
        const header = `# Figma Layout: ${jsonData.name || 'Unknown'}\n\n`;
        const fullMarkdown = header + markdown;
        
        // Write output
        await fs.writeFile(outputPath, fullMarkdown, 'utf-8');
        
        // Calculate stats
        const originalSize = jsonContent.length;
        const optimizedSize = fullMarkdown.length;
        const compressionRatio = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
        
        return {
            success: true,
            message: `Optimized successfully`,
            stats: {
                originalSize: (originalSize / 1024).toFixed(2) + ' KB',
                optimizedSize: (optimizedSize / 1024).toFixed(2) + ' KB',
                compressionRatio: compressionRatio + '%',
            }
        };
        
    } catch (error: any) {
        return {
            success: false,
            message: `Error: ${error.message}`
        };
    }
}