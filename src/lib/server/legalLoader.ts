import { XMLParser } from 'fast-xml-parser';
import { firestoreAdmin } from '$lib/server/firebase.admin';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LocalizedText = { ru: string; en: string };

export type AlertNode = {
    type: 'alert';
    severity: 'info' | 'warning' | 'error';
    icon: string;
    title: LocalizedText;
    text: LocalizedText;
};

export type LegalNode =
    | { type: 'title';      text: LocalizedText }
    | { type: 'section';    text: LocalizedText }
    | { type: 'subsection'; text: LocalizedText }
    | { type: 'paragraph';  text: LocalizedText }
    | { type: 'bullet';     text: LocalizedText }
    | AlertNode
    | { type: 'highlight'; title: string; description: LocalizedText }
    | { type: 'contact';   email: string };

export type ParsedLegalDoc = {
    id:      string;
    version: string;
    nodes:   LegalNode[];
};

export type LegalVersions = {
    privacy: string;
    tos:     string;
};

// ─── Parser instance (singleton, reused across calls) ─────────────────────────

const xmlParser = new XMLParser({
    ignoreAttributes:   false,
    attributeNamePrefix: '@_',
    preserveOrder:       true,
    textNodeName:        '#text',
    trimValues:          true,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText(nodes: unknown): string {
    if (!Array.isArray(nodes)) return String(nodes ?? '').trim();
    const hit = (nodes as any[]).find(n => '#text' in n);
    return String(hit?.['#text'] ?? '').trim();
}

function getLoc(children: any[]): LocalizedText {
    const ruNode = children.find(c => 'ru' in c);
    const enNode = children.find(c => 'en' in c);
    return {
        ru: ruNode ? extractText(ruNode['ru']) : '',
        en: enNode ? extractText(enNode['en']) : '',
    };
}

function getTag(child: any): string | null {
    return Object.keys(child).find(k => k !== ':@' && k !== '#text') ?? null;
}

// ─── Core parser ──────────────────────────────────────────────────────────────

export function parseXmlDoc(xmlString: string): ParsedLegalDoc {
    if (!xmlString?.trim()) return { id: '', version: '', nodes: [] };

    let parsed: any[];
    try {
        parsed = xmlParser.parse(xmlString);
    } catch (e) {
        console.error('[legalLoader] XML parse error:', e);
        return { id: '', version: '', nodes: [] };
    }

    const docEntry = (parsed as any[]).find(n => 'document' in n);
    if (!docEntry) return { id: '', version: '', nodes: [] };

    const attrs:    Record<string, string> = docEntry[':@'] ?? {};
    const id:       string                 = attrs['@_id']      ?? '';
    const version:  string                 = attrs['@_version'] ?? '';
    const children: any[]                  = docEntry['document'] ?? [];

    const nodes: LegalNode[] = [];

    for (const child of children) {
        const tag = getTag(child);
        if (!tag) continue;

        const content:    any[]                  = child[tag] ?? [];
        const childAttrs: Record<string, string> = child[':@'] ?? {};

        try {
            switch (tag) {
                case 'title':
                    nodes.push({ type: 'title', text: getLoc(content) });
                    break;

                case 'section':
                    nodes.push({ type: 'section', text: getLoc(content) });
                    break;

                case 'subsection':
                    nodes.push({ type: 'subsection', text: getLoc(content) });
                    break;

                case 'paragraph':
                    nodes.push({ type: 'paragraph', text: getLoc(content) });
                    break;

                case 'bullet':
                    nodes.push({ type: 'bullet', text: getLoc(content) });
                    break;

                case 'alert': {
                    const alertTitle = content.find(c => 'title' in c);
                    const alertText  = content.find(c => 'text'  in c);
                    const rawSeverity = childAttrs['@_severity'] ?? 'info';
                    nodes.push({
                        type:     'alert',
                        severity: (['info','warning','error'].includes(rawSeverity)
                            ? rawSeverity : 'info') as AlertNode['severity'],
                        icon:  childAttrs['@_icon'] ?? 'info',
                        title: alertTitle ? getLoc(alertTitle['title']) : { ru: '', en: '' },
                        text:  alertText  ? getLoc(alertText['text'])   : { ru: '', en: '' },
                    });
                    break;
                }

                case 'highlight': {
                    const hlTitle = content.find(c => 'title'       in c);
                    const hlDesc  = content.find(c => 'description' in c);
                    nodes.push({
                        type:        'highlight',
                        title:       hlTitle ? extractText(hlTitle['title'])  : '',
                        description: hlDesc  ? getLoc(hlDesc['description'])  : { ru: '', en: '' },
                    });
                    break;
                }

                case 'contact':
                    nodes.push({ type: 'contact', email: childAttrs['@_email'] ?? '' });
                    break;

                default:
                    // Unknown tag — skip silently
                    break;
            }
        } catch (e) {
            console.warn(`[legalLoader] Skipping malformed <${tag}> node:`, e);
        }
    }

    return { id, version, nodes };
}

// ─── Firestore loader ─────────────────────────────────────────────────────────

const LICENSES_REF = () => firestoreAdmin.collection('system').doc('licenses');

export async function loadLegalDoc(
    field: 'privacy_policy' | 'terms_of_service'
): Promise<{ doc: ParsedLegalDoc; version: string }> {
    try {
        const snap    = await LICENSES_REF().get();
        const data    = snap.data() ?? {};
        const xmlRaw  = data[field]              as string ?? '';
        const version = data[`${field}_version`] as string ?? '';
        return { doc: parseXmlDoc(xmlRaw), version };
    } catch (e) {
        console.error(`[legalLoader] Failed to load ${field}:`, e);
        return { doc: { id: '', version: '', nodes: [] }, version: '' };
    }
}

export async function loadLegalVersions(): Promise<LegalVersions> {
    try {
        const snap = await LICENSES_REF().get();
        const data = snap.data() ?? {};
        return {
            privacy: data['privacy_policy_version'] as string ?? '',
            tos:     data['terms_of_service_version'] as string ?? '',
        };
    } catch (e) {
        console.error('[legalLoader] Failed to load versions:', e);
        return { privacy: '', tos: '' };
    }
}