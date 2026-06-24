import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const FIGMA_API_BASE = 'https://api.figma.com/v1';

/**
 * Универсальная функция для выполнения запросов к Figma REST API
 */
async function figmaRequest<T>(
	endpoint: string,
	token: string,
	options: RequestInit = {}
): Promise<T> {
	const url = endpoint.startsWith('http') ? endpoint : `${FIGMA_API_BASE}${endpoint}`;
	const response = await fetch(url, {
		...options,
		headers: {
			'X-Figma-Token': token,
			'Content-Type': 'application/json',
			...(options.headers || {}),
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Figma API error: ${response.status} ${response.statusText}\n${errorText}`
		);
	}

	return response.json() as Promise<T>;
}

/**
 * Скачивание файла по URL с сохранением на диск
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
	await fs.mkdir(path.dirname(outputPath), { recursive: true });

	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new Error(`Failed to download file from ${url}: ${response.statusText}`);
	}

	const nodeStream = Readable.fromWeb(response.body as any);
	const fileStream = await fs.open(outputPath, 'w');

	try {
		await pipeline(nodeStream, fileStream.createWriteStream());
	} finally {
		await fileStream.close();
	}
}

/**
 * Утилитарная функция для генерации безопасного имени файла
 */
function sanitizeFileName(name: string): string {
	return name.replace(/[^a-z0-9_\-]/gi, '_').substring(0, 100);
}

// ============================================================================
// Публичные методы
// ============================================================================

/**
 * Получение JSON-представления файла (дерево узлов) и сохранение его на диск
 * @param fileKey - Ключ файла Figma (из URL: figma.com/design/<fileKey>/...)
 * @param token - Personal Access Token
 * @param outputPath - Путь, куда сохранить JSON файл
 * @param options - Дополнительные параметры запроса
 */
export async function getFigmaFileJson(
	fileKey: string,
	token: string,
	outputPath: string,
	options: { geometry?: boolean; pluginData?: boolean } = {}
): Promise<string> {
	const params = new URLSearchParams();
	if (options.geometry) {
		params.append('geometry', 'paths');
	}
	if (options.pluginData) {
		params.append('plugin_data', 'shared');
	}

	const queryString = params.toString() ? `?${params.toString()}` : '';
	const data = await figmaRequest<any>(
		`/files/${fileKey}${queryString}`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');

	return outputPath;
}

/**
 * Получение изображений из файла и их скачивание
 * @param fileKey - Ключ файла Figma
 * @param token - Personal Access Token
 * @param nodeIds - Массив ID узлов для экспорта (например, ["1:2", "3:4"])
 * @param outputDir - Директория, куда сохранять изображения
 * @param options - Параметры экспорта (формат, масштаб и т.д.)
 * @returns Массив путей к сохраненным файлам
 */
export async function getFigmaImages(
	fileKey: string,
	token: string,
	nodeIds: string[],
	outputDir: string,
	options: {
		format?: 'jpg' | 'png' | 'svg' | 'pdf';
		scale?: number;
		svgIncludeId?: boolean;
		contentsOnly?: boolean;
	} = {}
): Promise<string[]> {
	if (nodeIds.length === 0) {
		throw new Error('nodeIds array cannot be empty');
	}

	const params = new URLSearchParams();
	params.append('ids', nodeIds.join(','));
	if (options.format) {
		params.append('format', options.format);
	}
	if (options.scale !== undefined) {
		params.append('scale', options.scale.toString());
	}
	if (options.svgIncludeId !== undefined) {
		params.append('svg_include_id', options.svgIncludeId.toString());
	}
	if (options.contentsOnly !== undefined) {
		params.append('contents_only', options.contentsOnly.toString());
	}

	const data = await figmaRequest<{
		images: Record<string, string | null>;
		err?: string;
	}>(`/images/${fileKey}?${params.toString()}`, token);

	if (data.err) {
		throw new Error(`Figma images API error: ${data.err}`);
	}

	await fs.mkdir(outputDir, { recursive: true });

	const savedPaths: string[] = [];
	const downloadPromises = Object.entries(data.images).map(
		async ([nodeId, imageUrl]) => {
			if (!imageUrl) {
				return;
			}

			const extension = options.format || 'png';
			const fileName = `${sanitizeFileName(nodeId)}.${extension}`;
			const outputPath = path.join(outputDir, fileName);

			await downloadFile(imageUrl, outputPath);
			savedPaths.push(outputPath);
		}
	);

	await Promise.all(downloadPromises);
	return savedPaths;
}

/**
 * Получение локальных переменных (дизайн-токенов) из файла
 * @param fileKey - Ключ файла Figma
 * @param token - Personal Access Token
 * @param outputPath - Путь, куда сохранить JSON с переменными
 */
export async function getFigmaVariables(
	fileKey: string,
	token: string,
	outputPath: string
): Promise<string> {
	const data = await figmaRequest<any>(
		`/files/${fileKey}/variables/local`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');

	return outputPath;
}

/**
 * Получение стилей из файла
 * @param fileKey - Ключ файла Figma
 * @param token - Personal Access Token
 * @param outputPath - Путь, куда сохранить JSON со стилями
 */
export async function getFigmaStyles(
	fileKey: string,
	token: string,
	outputPath: string
): Promise<string> {
	const data = await figmaRequest<any>(
		`/files/${fileKey}/styles`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');

	return outputPath;
}

/**
 * Получение комментариев из файла
 * @param fileKey - Ключ файла Figma
 * @param token - Personal Access Token
 * @param outputPath - Путь, куда сохранить JSON с комментариями
 */
export async function getFigmaComments(
	fileKey: string,
	token: string,
	outputPath: string
): Promise<string> {
	const data = await figmaRequest<any>(
		`/files/${fileKey}/comments`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');

	return outputPath;
}

/**
 * Получение списка версий файла
 * @param fileKey - Ключ файла Figma
 * @param token - Personal Access Token
 * @param outputPath - Путь, куда сохранить JSON с версиями
 */
export async function getFigmaVersions(
	fileKey: string,
	token: string,
	outputPath: string
): Promise<string> {
	const data = await figmaRequest<any>(
		`/files/${fileKey}/versions`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');

	return outputPath;
}

/**
 * Комплексный метод: получение всего макета (JSON + изображения + переменные)
 * @param fileKey - Ключ файла Figma
 * @param token - Personal Access Token
 * @param outputDir - Базовая директория для сохранения
 * @param nodeIds - ID узлов для экспорта в виде изображений (опционально)
 */
export async function downloadFigmaLayout(
	fileKey: string,
	token: string,
	outputDir: string,
	nodeIds?: string[]
): Promise<{
	fileJson: string;
	variables: string;
	styles: string;
	images: string[];
}> {
	await fs.mkdir(outputDir, { recursive: true });

	const [fileJson, variables, styles] = await Promise.all([
		getFigmaFileJson(fileKey, token, path.join(outputDir, 'file.json')),
		getFigmaVariables(fileKey, token, path.join(outputDir, 'variables.json')),
		getFigmaStyles(fileKey, token, path.join(outputDir, 'styles.json')),
	]);

	let images: string[] = [];
	if (nodeIds && nodeIds.length > 0) {
		images = await getFigmaImages(
			fileKey,
			token,
			nodeIds,
			path.join(outputDir, 'images'),
			{ format: 'png', scale: 2 }
		);
	}

	return { fileJson, variables, styles, images };
}