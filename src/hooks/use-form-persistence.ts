
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm, FieldValues } from 'react-hook-form';
import { useAuth } from './use-auth';
import * as idb from '@/lib/idb';
import { useToast } from './use-toast';

export function useFormPersistence<T extends FieldValues>(
    formIdentifier: string, 
    form: ReturnType<typeof useForm<T>>,
    originalDefaultValues: T,
    attachments: string[], 
    setAttachments: (attachments: string[] | ((prev: string[]) => string[])) => void,
    isEditMode = false
) {
    const { user } = useAuth();
    const { watch, reset } = form;
    const { toast } = useToast();

    const [isRestoreDialogOpen, setRestoreDialogOpen] = useState(false);
    
    const [draftCheckComplete, setDraftCheckComplete] = useState(false);

    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Save form data (text, numbers, etc.) to localStorage on change.
    // localStorage is used for small, simple data.
    useEffect(() => {
        const storageKey = getStorageKey();
        if (isEditMode || !storageKey || typeof window === 'undefined' || !draftCheckComplete) return;

        const subscription = watch((value) => {
            localStorage.setItem(storageKey, JSON.stringify(value));
        });
        return () => subscription.unsubscribe();
    }, [watch, getStorageKey, draftCheckComplete, isEditMode]);

    // Save attachments (base64 image strings) to IndexedDB on change.
    // IndexedDB is used for large data to avoid hitting localStorage limits (especially on mobile).
    useEffect(() => {
        const storageKey = getStorageKey();
        if (isEditMode || !storageKey || !draftCheckComplete) return;

        const attachmentsKey = `${storageKey}-attachments`;
        idb.set(attachmentsKey, attachments).catch(err => {
            console.error("Failed to save attachments to IndexedDB", err);
        });
    }, [attachments, getStorageKey, draftCheckComplete, isEditMode]);

    // Check for saved data on mount
    useEffect(() => {
        if (isEditMode) {
            setDraftCheckComplete(true);
            return;
        }

        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined') {
            setDraftCheckComplete(true); // Default to complete if no key
            return;
        }

        const checkData = async () => {
            // Check for data in both localStorage (form fields) and IndexedDB (attachments).
            const savedData = localStorage.getItem(storageKey);
            const attachmentsKey = `${storageKey}-attachments`;
            const savedAttachments = await idb.get<string[]>(attachmentsKey);
            
            if (savedData || (savedAttachments && savedAttachments.length > 0)) {
                // If there's a draft, prompt user. The watchers remain disabled.
                setRestoreDialogOpen(true);
            } else {
                // No draft, we can enable watchers.
                setDraftCheckComplete(true);
            }
        };

        checkData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getStorageKey, isEditMode]);

    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        try {
            // Restore attachments from IndexedDB
            const attachmentsKey = `${storageKey}-attachments`;
            const savedAttachments = await idb.get<string[]>(attachmentsKey);
            if (savedAttachments) {
                setAttachments(savedAttachments);
            }

            // Restore form fields from localStorage
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                // Ensure date strings are converted back to Date objects
                Object.keys(parsedData).forEach(key => {
                    const value = parsedData[key];
                    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                         parsedData[key] = new Date(value);
                    }
                });
                reset(parsedData);
            }
            
            toast({ title: "Datos Restaurados", description: "Tu borrador ha sido cargado." });
        } catch (e) {
            console.error("Failed to restore draft", e);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo restaurar el borrador." });
        } finally {
            setRestoreDialogOpen(false);
            // Now that restore is complete, enable saving for subsequent changes.
            setDraftCheckComplete(true); 
        }
    }, [getStorageKey, reset, setAttachments, toast]);

    const discardDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        try {
            const attachmentsKey = `${storageKey}-attachments`;
            localStorage.removeItem(storageKey);
            await idb.del(attachmentsKey);
            
            reset(originalDefaultValues);
            setAttachments([]);

            toast({ title: "Borrador Descartado" });
        } catch (e) {
            console.error("Failed to discard draft", e);
            toast({ variant: "destructive", title: "Error", description: "No se pudo descartar el borrador." });
        } finally {
            setRestoreDialogOpen(false);
            setDraftCheckComplete(true);
        }
    }, [getStorageKey, reset, originalDefaultValues, setAttachments, toast]);
    
    // Clear draft from both storage systems
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
