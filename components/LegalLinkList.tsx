import React from 'react';
import { LEGAL_DOCS, LegalDoc } from '../legalDocs';

interface Props {
    containerClassName: string;
    linkClassName: string;
    extraLinks?: ReadonlyArray<LegalDoc>;
}

export const LegalLinkList: React.FC<Props> = ({ containerClassName, linkClassName, extraLinks = [] }) => (
    <ul className={containerClassName}>
        {[...LEGAL_DOCS, ...extraLinks].map(doc => (
            <li key={doc.url}>
                <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={doc.ariaLabel}
                    className={linkClassName}
                >
                    {doc.label}
                </a>
            </li>
        ))}
    </ul>
);
