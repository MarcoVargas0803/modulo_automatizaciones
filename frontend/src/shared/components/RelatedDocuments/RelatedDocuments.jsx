import React from 'react';
import { FileText } from 'lucide-react';
import './RelatedDocuments.css';

/** Roles SAP traducidos. Un rol fuera de este mapa se muestra crudo, en inglés y en mayúsculas. */
const ROLE_LABELS = {
  TARGET_DOCUMENT: 'Documento objetivo',
  BASE_DOCUMENT: 'Documento base',
  RESULT_DOCUMENT: 'Documento generado',
  CREATED_DOCUMENT: 'Documento creado',
};

/** Traduce "MaterialRevaluation DocEntry 123" a "Revaluación Número 123". Cualquier otro nombre pasa intacto. */
function formatDocumentName(name) {
  const match = /^MaterialRevaluation\s+DocEntry\s+(\d+)\s*$/i.exec(String(name).trim());
  return match ? `Revaluación Número ${match[1]}` : name;
}

/**
 * RelatedDocuments — Lista de documentos SAP relacionados, para una celda de tabla.
 *
 * Tolera datos irregulares por diseño: de cada documento acepta tanto camelCase
 * como snake_case (`displayName` o `display_name`, `subjectType` o
 * `subject_type`…), y cualquier valor que no sea un array se trata como lista
 * vacía. No hace falta normalizar la respuesta antes de pasársela.
 *
 * Sus estilos viven en `RelatedDocuments.css`, en esta misma carpeta. Antes
 * estaban duplicados línea por línea en `pages/Dashboard/Dashboard.css` y
 * `pages/Logs/Logs.css`, así que el componente **solo se veía bien en esas dos
 * páginas** y en cualquier otra salía como texto plano.
 *
 * ── Trampas ──────────────────────────────────────────────────────────────────
 * - **Lleva reglas de negocio de SAP dentro** (ver `formatDocumentName` y
 *   `ROLE_LABELS`): lógica de un proceso concreto en un componente de
 *   presentación. Un rol fuera del mapa se muestra en inglés junto a los
 *   traducidos.
 * - **Para el texto de "sin datos" se usa `emptyLabel`, no un `<span>` propio.**
 *   `.documents-empty` es una clase interna del componente, no contrato público.
 *
 * @param {Object[]} [documents]  - Documentos SAP. Acepta camelCase y snake_case; un valor no-array se trata como lista vacía.
 * @param {string}   emptyLabel   - Texto cuando no hay documentos. (default: 'Sin documentos')
 *
 * @example
 * // En una celda de DataTable, dentro de Dashboard o Logs
 * {
 *   header: 'Documentos',
 *   cell: (row) => <RelatedDocuments documents={row.relatedDocuments} />,
 * }
 *
 * @example
 * // Texto vacío a medida: con la prop, no duplicando el markup
 * <RelatedDocuments documents={row.documentos} emptyLabel="No aplica" />
 */
export function RelatedDocuments({ documents, emptyLabel = 'Sin documentos' }) {
  const list = Array.isArray(documents) ? documents : [];

  if (!list.length) {
    return <span className="documents-empty">{emptyLabel}</span>;
  }

  return (
    <div className="documents-list-cell">
      {list.map((document, index) => {
        const documentName = formatDocumentName(
          document.displayName ||
          document.display_name ||
          document.subjectKey ||
          document.subject_key ||
          'Documento sin referencia',
        );
        const documentType =
          document.displaySubjectType ||
          document.display_subject_type ||
          document.subjectType ||
          document.subject_type;
        const rawRole =
          document.displaySubjectRole ||
          document.display_subject_role ||
          document.subjectRole ||
          document.subject_role;
        const documentRole = ROLE_LABELS[rawRole] || rawRole;
        const documentMeta = [documentType, documentRole]
          .filter(Boolean)
          .join(' · ');

        return (
          <span
            key={`${document.id || documentName}-${index}`}
            className="document-chip"
            title={documentMeta ? `${documentName} - ${documentMeta}` : documentName}
          >
            <FileText className="document-chip-icon" size={14} />
            <span className="document-chip-text">
              <span className="document-name">{documentName}</span>
              {documentMeta && (
                <span className="document-meta">{documentMeta}</span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
