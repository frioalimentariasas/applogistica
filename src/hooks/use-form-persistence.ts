
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
    setAttachments: (attachments: string[] | ((prev: string[]) => string[])) => void
) {
    const { user } = useAuth();
    const { watch, reset, formState: { defaultValues } } = form;
    const { toast } = useToast();

    const [isRestoreDialogOpen, setRestoreDialogOpen] = useState(false);
    
    // This flag tracks the whole initial loading/restoring cycle.
    // Using state instead of ref to trigger effects when it changes.
    const [isDraftLoading, setDraftLoading] = useState(true);

    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Save form data to localStorage on change
    useEffect(() => {
        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined' || isDraftLoading) return;

        const subscription = watch((value) => {
            localStorage.setItem(storageKey, JSON.stringify(value));
        });
        return () => subscription.unsubscribe();
    }, [watch, getStorageKey, isDraftLoading]);

    // Save attachments to IndexedDB on change
    useEffect(() => {
        const storageKey = getStorageKey();
        if (!storageKey || isDraftLoading) return;

        const attachmentsKey = `${storageKey}-attachments`;
        idb.set(attachmentsKey, attachments).catch(err => {
            console.error("Failed to save attachments to IndexedDB", err);
        });
    }, [attachments, getStorageKey, isDraftLoading]);

    // Check for saved data on mount
    useEffect(() => {
        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined') return;

        const checkData = async () => {
            const savedData = localStorage.getItem(storageKey);
            const attachmentsKey = `${storageKey}-attachments`;
            const savedAttachments = await idb.get<string[]>(attachmentsKey);
            
            if (savedData || (savedAttachments && savedAttachments.length > 0)) {
                // If there's a draft, wait for user action (restore/discard)
                setRestoreDialogOpen(true);
            } else {
                // No draft, we can enable saving.
                setDraftLoading(false);
            }
        };

        checkData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getStorageKey]);

    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        try {
            const attachmentsKey = `${storageKey}-attachments`;
            const savedData = localStorage.getItem(storageKey);
            const savedAttachments = await idb.get<string[]>(attachmentsKey);

            if (savedAttachments) {
                setAttachments(savedAttachments);
            }

            if (savedData) {
                const parsedData = JSON.parse(savedData);
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
            setDraftLoading(false); 
        }
    }, [getStorageKey, reset, setAttachments, toast]);

    const discardDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        try {
            const attachmentsKey = `${storageKey}-attachments`;
            localStorage.removeItem(storageKey);
            await idb.del(attachmentsKey);
            
            reset(defaultValues as T); 
            setAttachments([]);
            toast({ title: "Borrador Descartado" });
        } catch (e) {
            console.error("Failed to discard draft", e);
        } finally {
            setRestoreDialogOpen(false);
            // Discarding is complete, enable saving for the new blank form.
            setDraftLoading(false);
        }
    }, [getStorageKey, reset, defaultValues, setAttachments, toast]);
    
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
