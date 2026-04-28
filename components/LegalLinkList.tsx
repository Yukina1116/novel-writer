import React from 'react';
import { LEGAL_DOCS } from '../legalDocs';

interface Props {
    containerClassName: string;
    linkClassName: string;
}

export const LegalLinkList: React.FC<Props> = ({ containerClassName, linkClassName }) => (
    <ul className={containerClassName}>
        {LEGAL_DOCS.map(doc => (
            <li key={doc.url}>
                <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClassName}
                >
                    {doc.label}
                </a>
            </li>
        ))}
    </ul>
);
