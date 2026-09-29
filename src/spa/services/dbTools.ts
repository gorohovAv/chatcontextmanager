import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function findCliTool(toolName: string): string {
    if (os.platform() === 'win32') {
        if (toolName === 'psql') {
            const pgDir = 'C:\\Program Files\\PostgreSQL';
            if (fs.existsSync(pgDir)) {
                const versions = fs.readdirSync(pgDir).filter(v => v.match(/^\d+$/)).sort((a, b) => parseInt(b) - parseInt(a));
                for (const v of versions) {
                    const toolPath = path.join(pgDir, v, 'bin', 'psql.exe');
                    if (fs.existsSync(toolPath)) {
                        return `"${toolPath}"`;
                    }
                }
            }
        } else if (toolName === 'mysql') {
            const myDir = 'C:\\Program Files\\MySQL';
            if (fs.existsSync(myDir)) {
                const versions = fs.readdirSync(myDir).filter(v => v.startsWith('MySQL Server')).sort().reverse();
                for (const v of versions) {
                    const toolPath = path.join(myDir, v, 'bin', 'mysql.exe');
                    if (fs.existsSync(toolPath)) {
                        return `"${toolPath}"`;
                    }
                }
            }
        }
    }
    return toolName;
}

export async function fetchDbSchema(connStr: string): Promise<string> {
    let cmd = '';
    let dbType = '';
    let toolName = '';
    
    if (connStr.startsWith('postgres://') || connStr.startsWith('postgresql://')) {
        dbType = 'postgres';
        toolName = 'psql';
        
        let cleanUri = connStr;
        let schema = 'current_schema()';

        const schemaMatch = connStr.match(/[?&](schema|search_path|currentSchema)=([^&]+)/);
        if (schemaMatch) {
            schema = `'${decodeURIComponent(schemaMatch[2]).replace(/'/g, "''")}'`;
            cleanUri = connStr.replace(new RegExp(`[?&]${schemaMatch[1]}=[^&]+`), '');
            cleanUri = cleanUri.replace(/\?&/, '?').replace(/\?$/, '');
        } else {
            const optionsMatch = connStr.match(/[?&]options=([^&]+)/);
            if (optionsMatch) {
                const options = decodeURIComponent(optionsMatch[1]);
                const searchPathMatch = options.match(/search_path[=\s]+(\w+)/);
                if (searchPathMatch) {
                    schema = `'${searchPathMatch[1].replace(/'/g, "''")}'`;
                }
                cleanUri = connStr.replace(new RegExp(`[?&]options=[^&]+`), '');
                cleanUri = cleanUri.replace(/\?&/, '?').replace(/\?$/, '');
            }
        }

        const query = `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema=${schema} ORDER BY table_name, ordinal_position;`;
        cmd = `${findCliTool(toolName)} "${cleanUri}" -t -A -F"|" -c "${query}"`;
    } else if (connStr.startsWith('mysql://')) {
        dbType = 'mysql';
        toolName = 'mysql';
        const query = "SELECT table_name, column_name, column_type FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name, ordinal_position;";
        cmd = `${findCliTool(toolName)} "${connStr}" -N -B -e "${query}"`;
    } else if (connStr.startsWith('sqlite://')) {
        dbType = 'sqlite';
        toolName = 'sqlite3';
        let filePath = connStr.replace(/^sqlite:\/\//, '');
        if (filePath.match(/^\/[A-Za-z]:\//)) {
            filePath = filePath.substring(1);
        }
        const query = "SELECT m.name, p.name, p.type FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name, p.cid;";
        cmd = `${findCliTool(toolName)} "${filePath}" "${query}"`;
    } else {
        throw new Error('Unsupported DB type. Use postgres://, mysql://, or sqlite://');
    }

    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 10, windowsHide: true });
    
    if (stderr && dbType !== 'sqlite') {
        const cleanStderr = stderr.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanStderr.toLowerCase().includes('error') || cleanStderr.toLowerCase().includes('not recognized') || cleanStderr.toLowerCase().includes('not found')) {
            throw new Error(cleanStderr || 'Command failed');
        }
    }

    return parseSchemaOutput(stdout, dbType);
}

export function parseSchemaOutput(output: string, dbType: string): string {
    const tables: { [key: string]: string[] } = {};
    const lines = output.split('\n').filter(line => line.trim().length > 0);
    
    for (const line of lines) {
        let parts: string[] = [];
        if (dbType === 'postgres' || dbType === 'sqlite') {
            parts = line.split('|');
        } else if (dbType === 'mysql') {
            parts = line.split('\t');
        }
        
        if (parts.length >= 3) {
            const tableName = parts[0].trim();
            const colName = parts[1].trim();
            const colType = parts[2].trim();
            
            if (!tables[tableName]) {
                tables[tableName] = [];
            }
            tables[tableName].push(`${colName}: ${colType}`);
        }
    }
    
    let result = '';
    for (const table in tables) {
        result += `     ${table}(${tables[table].join(', ')})\n`;
    }
    
    return result;
}