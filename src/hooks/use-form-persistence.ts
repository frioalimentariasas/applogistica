
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
    const { reset, getValues } = form;
    const { toast } = useToast();

    const [isRestoreDialogOpen, setRestoreDialogOpen] = useState(false);
    
    // This flag prevents saving until the user has made a decision about the draft.
    const [canSaveDraft, setCanSaveDraft] = useState(false);

    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Effect to check for an existing draft when the component mounts.
    useEffect(() => {
        if (isEditMode) {
            setCanSaveDraft(false); // Never save drafts when editing an existing form.
            return;
        }

        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined') {
            setCanSaveDraft(true); // Nothing to restore, so it's safe to start saving new data.
            return;
        }

        const checkData = async () => {
            try {
                const savedData = localStorage.getItem(storageKey);
                const attachmentsKey = `${storageKey}-attachments`;
                const savedAttachments = await idb.get<string[]>(attachmentsKey);
                
                if (savedData || (savedAttachments && savedAttachments.length > 0)) {
                    // A draft was found. Prompt the user. Saving remains disabled.
                    setRestoreDialogOpen(true);
                } else {
                    // No draft found, so enable saving for any new input.
                    setCanSaveDraft(true);
                }
            } catch (e) {
                console.error("Failed to check for draft", e);
                setCanSaveDraft(true); // Allow saving even if check fails to avoid blocking the user.
            }
        };

        checkData();
    // This effect should only run once on mount for a given user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getStorageKey, isEditMode]);


    // This effect handles the saving logic.
    // It uses the 'visibilitychange' event, which is the most reliable way on mobile
    // to save data before a tab is backgrounded or closed.
    useEffect(() => {
        const storageKey = getStorageKey();
        // Do not attach the listener if we can't save (e.g., in edit mode or before draft check).
        if (!canSaveDraft || !storageKey) return;

        const saveDraft = () => {
            const currentValues = getValues();
            const attachmentsKey = `${storageKey}-attachments`;

            try {
                // Synchronous operation, safe to do here.
                localStorage.setItem(storageKey, JSON.stringify(currentValues));

                // Asynchronous operation. The 'hidden' state gives us the best chance for it to complete.
                idb.set(attachmentsKey, attachments).catch(err => {
                    console.error("Failed to save attachments draft", err);
                });
            } catch (e) {
                console.error("Failed to save draft to storage", e);
                toast({
                    variant: 'destructive',
                    title: 'Error de Guardado Automático',
                    description: 'No se pudo guardar el borrador. Es posible que el almacenamiento esté lleno.'
                });
            }
        };
        
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                saveDraft();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };

    }, [canSaveDraft, getStorageKey, getValues, attachments, toast]);


    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        try {
            // Restore attachments from IndexedDB first
            const attachmentsKey = `${storageKey}-attachments`;
            const savedAttachments = await idb.get<string[]>(attachmentsKey);
            if (savedAttachments) {
                setAttachments(savedAttachments);
            }

            // Restore form fields from localStorage
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                // Ensure date strings are converted back to Date objects before resetting
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
            setCanSaveDraft(true); 
        }
    }, [getStorageKey, reset, setAttachments, toast]);

    const discardDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        setCanSaveDraft(false); // Disable saving while we clear things out.

        try {
            reset(originalDefaultValues);
            setAttachments([]);

            const attachmentsKey = `${storageKey}-attachments`;
            localStorage.removeItem(storageKey);
            await idb.del(attachmentsKey);

            toast({ title: "Borrador Descartado" });
        } catch (e) {
            console.error("Failed to discard draft", e);
            toast({ variant: "destructive", title: "Error", description: "No se pudo descartar el borrador." });
        } finally {
            setRestoreDialogOpen(false);
            // Re-enable saving for new input.
            setCanSaveDraft(true);
        }
    }, [getStorageKey, reset, originalDefaultValues, setAttachments, toast]);
    
    const clearDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;
        setCanSaveDraft(false); // Disable saving
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
