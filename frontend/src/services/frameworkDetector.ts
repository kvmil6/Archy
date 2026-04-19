/**
 * Framework auto-detection via evidence scoring.
 *
 * Scans filenames and inspects a handful of key files (requirements.txt,
 * pyproject.toml, manage.py, etc.) to determine the most likely framework.
 * Returns confidence score + runner-ups.
 */
import { getFileContent } from './fileSystem';

export type DetectedFramework =
    | 'django'
    | 'fastapi'
    | 'flask'
    | 'starlette'
    | 'tornado'
    | 'aiohttp'
    | 'express'
    | 'nextjs'
    | 'nestjs'
    | 'rails'
    | 'spring'
    | 'unknown';

export interface FrameworkDetection {
    framework: DetectedFramework;
    confidence: number; // 0 to 1
    signals: string[]; // Human-readable reasons
    runnerUp?: DetectedFramework;
}

// Signal weights — higher = stronger evidence
const SIGNALS = {
    // Django
    djangoManagePy: { fw: 'django', weight: 100, msg: '`manage.py` found' },
    djangoSettings: { fw: 'django', weight: 60, msg: '`settings.py` with Django markers' },
    djangoWsgi: { fw: 'django', weight: 50, msg: '`wsgi.py` with Django app' },
    djangoInstalledApps: { fw: 'django', weight: 80, msg: 'INSTALLED_APPS in settings.py' },
    djangoUrls: { fw: 'django', weight: 30, msg: '`urls.py` present' },
    djangoMigrations: { fw: 'django', weight: 40, msg: 'migrations folder present' },
    djangoAdmin: { fw: 'django', weight: 30, msg: '`admin.py` present' },
    djangoReq: { fw: 'django', weight: 70, msg: 'Django in requirements' },

    // FastAPI
    fastapiImport: { fw: 'fastapi', weight: 100, msg: 'FastAPI() import detected' },
    fastapiAppDef: { fw: 'fastapi', weight: 90, msg: 'app = FastAPI(...) found' },
    fastapiReq: { fw: 'fastapi', weight: 70, msg: 'fastapi in requirements' },
    fastapiRouters: { fw: 'fastapi', weight: 30, msg: 'routers/ folder present' },
    uvicorn: { fw: 'fastapi', weight: 30, msg: 'uvicorn in requirements' },

    // Flask
    flaskImport: { fw: 'flask', weight: 100, msg: 'Flask() import detected' },
    flaskAppDef: { fw: 'flask', weight: 90, msg: 'app = Flask(...) found' },
    flaskReq: { fw: 'flask', weight: 70, msg: 'flask in requirements' },
    flaskBlueprints: { fw: 'flask', weight: 40, msg: 'Blueprint usage detected' },

    // Starlette
    starletteImport: { fw: 'starlette', weight: 100, msg: 'Starlette import detected' },

    // Tornado
    tornadoImport: { fw: 'tornado', weight: 100, msg: 'tornado import detected' },

    // aiohttp
    aiohttpImport: { fw: 'aiohttp', weight: 100, msg: 'aiohttp web.Application detected' },

    // Express / Node
    expressImport: { fw: 'express', weight: 100, msg: 'express() detected in JS/TS' },
    expressReq: { fw: 'express', weight: 80, msg: 'express in package.json' },
    
    // Next.js
    nextReq: { fw: 'nextjs', weight: 100, msg: 'next in package.json' },
    nextConfig: { fw: 'nextjs', weight: 90, msg: 'next.config.js/ts present' },

    // NestJS
    nestReq: { fw: 'nestjs', weight: 100, msg: '@nestjs/core in package.json' },
    nestMain: { fw: 'nestjs', weight: 60, msg: 'NestFactory.create() detected' },

    // Rails (Ruby)
    railsGem: { fw: 'rails', weight: 100, msg: 'rails gem detected' },
    railsStructure: { fw: 'rails', weight: 60, msg: 'Rails-style app/ structure' },

    // Spring (Java)
    springBoot: { fw: 'spring', weight: 100, msg: '@SpringBootApplication detected' },
    pomXml: { fw: 'spring', weight: 40, msg: 'pom.xml with spring-boot-starter' },
} as const;

type SignalKey = keyof typeof SIGNALS;

export async function detectFrameworkSmart(
    files: string[],
): Promise<FrameworkDetection> {
    const scores: Partial<Record<DetectedFramework, number>> = {};
    const signals: string[] = [];

    const addScore = (key: SignalKey) => {
        const s = SIGNALS[key];
        scores[s.fw] = (scores[s.fw] || 0) + s.weight;
        signals.push(s.msg);
    };

    // Fast filename-based signals
    const pathSet = new Set(files.map((f) => f.toLowerCase()));
    const hasPath = (needle: string) =>
        Array.from(pathSet).some((p) => p.endsWith('/' + needle) || p === needle);
    const hasAnyEndingWith = (suffix: string) =>
        Array.from(pathSet).some((p) => p.endsWith(suffix));
    const hasPathContaining = (sub: string) =>
        Array.from(pathSet).some((p) => p.includes(sub));

    if (hasPath('manage.py')) addScore('djangoManagePy');
    if (hasPath('wsgi.py')) addScore('djangoWsgi');
    if (hasPathContaining('/migrations/')) addScore('djangoMigrations');
    if (hasAnyEndingWith('/admin.py') || hasPath('admin.py')) addScore('djangoAdmin');
    if (hasAnyEndingWith('/urls.py') || hasPath('urls.py')) addScore('djangoUrls');

    if (hasPathContaining('/routers/')) addScore('fastapiRouters');

    if (hasPath('next.config.js') || hasPath('next.config.ts') || hasPath('next.config.mjs')) {
        addScore('nextConfig');
    }

    if (hasPath('gemfile')) addScore('railsGem');
    if (hasPath('pom.xml')) addScore('pomXml');

    // Deeper content-based signals — read a few key files
    const readFirst = async (candidates: string[]): Promise<string | null> => {
        for (const rel of candidates) {
            const match = files.find(
                (f) => f.toLowerCase() === rel.toLowerCase() || f.toLowerCase().endsWith('/' + rel.toLowerCase()),
            );
            if (match) {
                try {
                    const content = await getFileContent(match);
                    if (content) return content;
                } catch {
                    /* ignore */
                }
            }
        }
        return null;
    };

    // 1. requirements.txt / pyproject.toml / Pipfile
    const pyDeps = await readFirst([
        'requirements.txt',
        'pyproject.toml',
        'Pipfile',
        'poetry.lock',
        'setup.py',
    ]);
    if (pyDeps) {
        const dl = pyDeps.toLowerCase();
        if (/(^|[\s=<>~])django[=<>~!]/m.test(dl) || /['"]django['"]/m.test(dl)) {
            addScore('djangoReq');
        }
        if (/fastapi/.test(dl)) addScore('fastapiReq');
        if (/uvicorn/.test(dl)) addScore('uvicorn');
        if (/(^|[\s=<>~])flask[=<>~!]/m.test(dl) || /['"]flask['"]/m.test(dl)) {
            addScore('flaskReq');
        }
    }

    // 2. package.json for JS frameworks
    const pkgJsonContent = await readFirst(['package.json']);
    if (pkgJsonContent) {
        try {
            const pkg = JSON.parse(pkgJsonContent);
            const alldeps = {
                ...(pkg.dependencies || {}),
                ...(pkg.devDependencies || {}),
            };
            if (alldeps['next']) addScore('nextReq');
            if (alldeps['express']) addScore('expressReq');
            if (alldeps['@nestjs/core']) addScore('nestReq');
        } catch {
            /* not json */
        }
    }

    // 3. settings.py content check
    const settingsContent = await readFirst([
        'settings.py',
        'config/settings.py',
        'myproject/settings.py',
    ]);
    if (settingsContent) {
        if (settingsContent.includes('INSTALLED_APPS')) addScore('djangoInstalledApps');
        if (/django/.test(settingsContent.toLowerCase())) addScore('djangoSettings');
    }

    // 4. main.py / app.py content check (key files for Python web frameworks)
    const entryContent = await readFirst([
        'main.py',
        'app.py',
        'server.py',
        'src/main.py',
        'app/main.py',
    ]);
    if (entryContent) {
        const ec = entryContent;
        if (/from\s+fastapi\s+import|import\s+fastapi/i.test(ec)) addScore('fastapiImport');
        if (/FastAPI\s*\(/.test(ec)) addScore('fastapiAppDef');
        if (/from\s+flask\s+import|import\s+flask/i.test(ec)) addScore('flaskImport');
        if (/Flask\s*\(\s*__name__/.test(ec)) addScore('flaskAppDef');
        if (/Blueprint\s*\(/.test(ec)) addScore('flaskBlueprints');
        if (/from\s+starlette/i.test(ec)) addScore('starletteImport');
        if (/import\s+tornado/i.test(ec)) addScore('tornadoImport');
        if (/from\s+aiohttp\s+import|web\.Application/i.test(ec)) addScore('aiohttpImport');
    }

    // 5. JS/TS entry files for Express / NestJS
    const jsEntryContent = await readFirst([
        'index.js',
        'server.js',
        'app.js',
        'src/index.js',
        'src/main.ts',
        'src/server.ts',
    ]);
    if (jsEntryContent) {
        if (/require\(['"]express['"]\)|from\s+['"]express['"]/i.test(jsEntryContent)) {
            addScore('expressImport');
        }
        if (/NestFactory\.create/.test(jsEntryContent)) {
            addScore('nestMain');
        }
    }

    // Pick winner
    const sorted = (Object.entries(scores) as [DetectedFramework, number][])
        .sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        return {
            framework: 'unknown',
            confidence: 0,
            signals: ['No framework signals detected'],
        };
    }

    const [winner, winnerScore] = sorted[0];
    const runnerUpScore = sorted[1]?.[1] ?? 0;
    const total = Math.max(sorted.reduce((a, [, v]) => a + v, 0), 1);
    // Confidence: winner's share of total, penalized if runner-up is close
    const rawShare = winnerScore / total;
    const gap = (winnerScore - runnerUpScore) / winnerScore;
    const confidence = Math.min(1, rawShare * (0.5 + 0.5 * gap));

    return {
        framework: winner,
        confidence,
        signals,
        runnerUp: sorted[1]?.[0],
    };
}
