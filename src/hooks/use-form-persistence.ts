
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, FieldValues, useWatch } from 'react-hook-form';
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
    
    // Use a ref to hold the debounce timer
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    const getStorageKey = useCallback(() => {
        if (!user) return null;
        return `${formIdentifier}-${user.uid}`;
    }, [formIdentifier, user]);

    // Use useWatch to get updates from the form values
    const watchedValues = useWatch({ control: form.control });

    // --- SAVE DRAFT LOGIC ---
    useEffect(() => {
        const storageKey = getStorageKey();
        if (isEditMode || !storageKey) {
            return;
        }

        // Clear previous timer if it exists
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        // Set a new timer to save the draft
        debounceTimer.current = setTimeout(() => {
            try {
                const currentValues = getValues();
                // Save form fields to localStorage (synchronous, fast)
                localStorage.setItem(storageKey, JSON.stringify(currentValues));
                
                // Save attachments to IndexedDB (asynchronous)
                const attachmentsKey = `${storageKey}-attachments`;
                idb.set(attachmentsKey, attachments).catch(err => {
                    console.error("Failed to save attachments draft to IDB", err);
                });
            } catch (e) {
                console.error("Failed to save draft", e);
            }
        }, 1500); // Debounce for 1.5 seconds

        // Cleanup function to clear the timer
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, [watchedValues, attachments, isEditMode, getStorageKey, getValues]);
    

    // --- RESTORE DRAFT LOGIC ---
    useEffect(() => {
        if (isEditMode) {
            return;
        }

        const storageKey = getStorageKey();
        if (!storageKey || typeof window === 'undefined') {
            return;
        }

        const checkData = async () => {
            try {
                const savedDataJSON = localStorage.getItem(storageKey);
                const attachmentsKey = `${storageKey}-attachments`;
                const savedAttachments = await idb.get<string[]>(attachmentsKey);

                let hasMeaningfulData = false;
                if (savedDataJSON) {
                    const savedData = JSON.parse(savedDataJSON);
                    // Heuristic: if a required field like pedidoSislog or cliente has a value,
                    // then the form is not blank and we should offer to restore.
                    if (savedData.pedidoSislog || savedData.cliente) {
                        hasMeaningfulData = true;
                    }
                }
                
                if (hasMeaningfulData || (savedAttachments && savedAttachments.length > 0)) {
                    setRestoreDialogOpen(true);
                }
            } catch (e) {
                console.error("Failed to check for draft", e);
            }
        };

        const timer = setTimeout(checkData, 100);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getStorageKey, isEditMode]);


    const restoreDraft = useCallback(async () => {
        const storageKey = getStorageKey();
        if (!storageKey) return;

        try {
            const savedData = localStorage.getItem(storageKey);
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

            const attachmentsKey = `${storageKey}-attachments`;
            const savedAttachments = await idb.get<string[]>(attachmentsKey);
            if (savedAttachments) {
                setAttachments(savedAttachments);
            }
            
            toast({ title: "Datos Restaurados", description: "Tu borrador ha sido cargado." });
        } catch (e) {
            console.error("Failed to restore draft", e);
            toast({ variant: 'destructive', title: "Error", description: "No se pudo restaurar el borrador." });
        } finally {
            setRestoreDialogOpen(false);
        }
    }, [getStorageKey, reset, setAttachments, toast]);

    const clearDraft = useCallback(async (showToast = false) => {
        // Clear any pending save operation before deleting the draft
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
        }
        
        const storageKey = getStorageKey();
        if (!storageKey) return;
        
        try {
            const attachmentsKey = `${storageKey}-attachments`;
            localStorage.removeItem(storageKey);
            await idb.del(attachmentsKey);
            
            if (showToast) {
                 toast({ title: "Borrador Descartado" });
            }
        } catch (e) {
            console.error("Failed to clear draft", e);
             if (showToast) {
                toast({ variant: "destructive", title: "Error", description: "No se pudo descartar el borrador." });
            }
        }
    }, [getStorageKey, toast]);

    const discardDraft = useCallback(async () => {
        // Must clear the draft storage first to prevent race condition with save effect
        await clearDraft(true);
        reset(originalDefaultValues);
        setAttachments([]);
        setRestoreDialogOpen(false);
    }, [reset, originalDefaultValues, setAttachments, clearDraft]);
    
    return {
        isRestoreDialogOpen,
        onOpenChange: setRestoreDialogOpen,
        onRestore: restoreDraft,
        onDiscard: discardDraft,
        clearDraft: () => clearDraft(false)
    };
}
