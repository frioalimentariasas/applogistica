"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm, FieldValues } from 'react-hook-form';
import { useAuth } from './use-auth';
import * as idb from '@/lib/idb';
import { useToast } from './use-toast';

export function useFormPersistence<T extends FieldValues>(
    formIdentifier: string, 
    form: ReturnType<typeof useForm<T>>,
    attachments: string[], 
    setAttachments: (attachments: string[]) => void
) {
    const { user } = useAuth();
    const { watch, reset, formState: { defaultValues } } = form;
    const { toast } = useToast();

    const [isRestoreDialogOpen, setRestoreDialogOpen] = useState(false);

    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Save form data to localStorage on change
    useEffect(() => {
        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined') return;

        const subscription = watch((value) => {
            localStorage.setItem(storageKey, JSON.stringify(value));
        });
        return () => subscription.unsubscribe();
    }, [watch, getStorageKey]);

    // Save attachments to IndexedDB on change
    useEffect(() => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        const attachmentsKey = `${storageKey}-attachments`;
        idb.set(attachmentsKey, attachments).catch(err => {
            console.error("Failed to save attachments to IndexedDB", err);
        });
    }, [attachments, getStorageKey]);

    // Check for saved data on mount
    useEffect(() => {
        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined') return;

        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
            // A short delay to allow the form to fully initialize before showing the dialog
            setTimeout(() => setRestoreDialogOpen(true), 100);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getStorageKey]);

    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        const savedData = localStorage.getItem(storageKey);
        const attachmentsKey = `${storageKey}-attachments`;

        try {
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (parsedData.fecha) {
                    parsedData.fecha = new Date(parsedData.fecha);
                }
                reset(parsedData);
            }
            const savedAttachments = await idb.get<string[]>(attachmentsKey);
            if (savedAttachments) {
                setAttachments(savedAttachments);
            }
            toast({ title: "Datos Restaurados" });
        } catch (e) {
            console.error("Failed to restore draft", e);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo restaurar el borrador." });
        }
        setRestoreDialogOpen(false);
    }, [getStorageKey, reset, setAttachments, toast]);

    const discardDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        const attachmentsKey = `${storageKey}-attachments`;
        localStorage.removeItem(storageKey);
        await idb.del(attachmentsKey);
        
        // Resetting form to its default values
        reset(defaultValues); 
        setAttachments([]);
        setRestoreDialogOpen(false);
    }, [getStorageKey, reset, defaultValues, setAttachments]);

    const clearDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        const attachmentsKey = `${storageKey}-attachments`;
        localStorage.removeItem(storageKey);
        await idb.del(attachmentsKey);
    }, [getStorageKey]);

    return {
        isRestoreDialogOpen,
        onOpenChange: setRestoreDialogOpen,
        onRestore: restoreDraft,
        onDiscard: discardDraft,
        clearDraft
    };
}
