import React, { createContext, useContext, useState, useEffect } from 'react';

export interface PPTDocument {
    id: string; // The backend json id or custom id
    url: string;
    titol: string;
    expedient: string;
    origen: 'Licitia' | 'SuperBuscador';
}

interface PPTContextType {
    documents: PPTDocument[];
    addDocument: (doc: PPTDocument) => void;
    removeDocument: (docId: string) => void;
    clearDocuments: () => void;
}

const PPTContext = createContext<PPTContextType | undefined>(undefined);

export const PPTProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [documents, setDocuments] = useState<PPTDocument[]>(() => {
        const saved = localStorage.getItem('ppt_documents');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('ppt_documents', JSON.stringify(documents));
    }, [documents]);

    const addDocument = (doc: PPTDocument) => {
        setDocuments(prev => {
            if (prev.some(d => d.id === doc.id || d.url === doc.url)) return prev;
            return [...prev, doc];
        });
    };

    const removeDocument = (docId: string) => {
        setDocuments(prev => prev.filter(d => d.id !== docId));
    };

    const clearDocuments = () => {
        setDocuments([]);
    };

    return (
        <PPTContext.Provider value={{ documents, addDocument, removeDocument, clearDocuments }}>
            {children}
        </PPTContext.Provider>
    );
};

export const usePPTCart = () => {
    const context = useContext(PPTContext);
    if (context === undefined) {
        throw new Error('usePPTCart must be used within a PPTProvider');
    }
    return context;
};
