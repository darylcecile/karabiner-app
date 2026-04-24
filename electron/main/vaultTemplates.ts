import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import yaml from "yaml";

export namespace FSReplay {

	export type FSOperation =
		| { type: 'createFile'; path: string, content?: string }
		| { type: 'createDirectory'; path: string }
		| { type: 'rename'; oldPath: string; newPath: string }
		| { type: 'delete'; path: string } 
		| { type: 'metadata'; path: string; metadata: Record<string, any> };

	export async function applyOperations(operations: FSOperation[]) {
		for (const operation of operations) {
			switch (operation.type) {
				case 'createFile':
					await writeFile(operation.path, operation.content ?? '');
					break;
				case 'createDirectory':
					await mkdir(operation.path, { recursive: true });
					break;
				case 'rename':
					await rename(operation.oldPath, operation.newPath);
					break;
				case 'delete':
					await rm(operation.path, { recursive: true, force: true });
					break;
				case 'metadata':
					// metadata operations require us to create/update the '.metadata' file in the path (or parent path if it is a file)
					// the '.metadata' file is a YAML file that contains a mapping of file/directory names to their metadata

					// 1. resolve the path
					const targetPathStat = await stat(operation.path);
					const metadataDir = targetPathStat.isDirectory() ? operation.path : dirname(operation.path);
					
					// 2. make sure it exists
					if (!existsSync(metadataDir)) {
						await mkdir(metadataDir, { recursive: true });
					}

					// 3. create if it doesn't exist
					const metadataFilePath = `${metadataDir}/.metadata`;
					if (!existsSync(metadataFilePath)) {
						await writeFile(metadataFilePath, '');
					}
					
					// 4. read the existing metadata
					const existingMetadataContent = await readFile(metadataFilePath, 'utf-8');
					const existingMetadata = existingMetadataContent ? yaml.parse(existingMetadataContent) : {};

					// 5. update the metadata
					const targetName = operation.path;
					existingMetadata[targetName] = {
						...existingMetadata[targetName],
						...operation.metadata,
					};

					// 6. write the updated metadata back to the file
					await writeFile(metadataFilePath, yaml.stringify(existingMetadata, { indent: 4 }));
					break;
			}
		}
	}

	export function defineOperations(operations: FSOperation[]) {
		return operations;
	}
}