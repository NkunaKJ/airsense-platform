"""Health guidance for each PM2.5 band.

This is general guidance written for AirSense. Check the band limits and the
wording against a health source you can cite before relying on it in your report.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/advice", tags=["advice"])

BANDS = [
    {"name": "Good", "min": 0, "max": 15, "colour": "#2e9e4f",
     "alert_level": "No special precautions",
     "general": "Air quality is good. Normal outdoor activity is fine."},
    {"name": "Moderate", "min": 15, "max": 35, "colour": "#c9a100",
     "alert_level": "Take care",
     "general": "Acceptable for most people. People with asthma, heart or lung "
                "conditions should watch for symptoms."},
    {"name": "Poor", "min": 35, "max": 55, "colour": "#e8801a",
     "alert_level": "Take precautions",
     "general": "Children, older adults and people with asthma, heart or lung "
                "conditions should cut down on hard outdoor activity."},
    {"name": "Very poor", "min": 55, "max": None, "colour": "#d13b3b",
     "alert_level": "Avoid hard effort outdoors",
     "general": "Everyone should limit time outdoors, and sensitive groups should "
                "stay indoors if possible. On the worst days, avoid outdoor "
                "activity altogether."},
]

DISCLAIMER = ("General guidance, not medical advice. If you have a health "
              "condition, follow your doctor's plan.")

# Short guidance for broad groups of people.
GROUP_LABELS = {
    "health": "People with heart, lung or breathing conditions",
    "parents": "Parents and carers",
    "outdoor": "Runners and outdoor workers",
}

GROUP_ADVICE = {
    "Good": {
        "health": "Normal activity is fine. Keep your usual medication with you, as you "
                  "normally would.",
        "parents": "Outdoor play and sport can go ahead as normal.",
        "outdoor": "Normal outdoor exercise and work are fine.",
    },
    "Moderate": {
        "health": "Most people with these conditions are fine, but watch for symptoms "
                  "such as coughing, wheezing, a tight chest, chest pain, shortness of "
                  "breath, a racing or irregular heartbeat, or unusual tiredness. Keep "
                  "your medication handy and ease off if you feel unwell.",
        "parents": "Outdoor play is fine for most children. Keep an eye on children with "
                   "asthma or other breathing problems.",
        "outdoor": "Normal activity is fine. If you notice symptoms, slow down or take a break.",
    },
    "Poor": {
        "health": "Cut down on hard outdoor activity and take things easier. Keep your "
                  "medication close, follow your doctor's plan (for example an asthma "
                  "action plan), and watch for the symptoms above. Stop and rest if you "
                  "feel unwell.",
        "parents": "Move strenuous sport indoors or shorten it for children with asthma "
                   "or other breathing problems, and watch for symptoms in all children.",
        "outdoor": "Ease off intense exercise, take more breaks, and consider doing hard "
                   "sessions indoors or at another time.",
    },
    "Very poor": {
        "health": "Stay indoors as much as possible, keep windows closed if you can, and "
                  "avoid any hard effort outside. Have your medication ready and follow "
                  "your doctor's plan. Get medical help if you have chest pain, trouble "
                  "breathing, or symptoms that get worse or do not go away.",
        "parents": "Move sport and play indoors, and keep young children and children "
                   "with asthma or other breathing problems indoors on the worst days.",
        "outdoor": "Avoid intense outdoor exercise, and avoid outdoor work where you "
                   "can. If you must be outside, take frequent breaks and consider a "
                   "well-fitted respirator mask (N95 or similar).",
    },
}

# Personal alerts: one profile per kind of person.
PROFILES = {
    "Asthma": {
        "who": "people with asthma",
        "have": "your reliever inhaler and your written asthma action plan",
        "watch": "coughing, wheezing, a tight chest or shortness of breath",
        "urgent": "severe breathlessness, or your reliever is not helping",
    },
    "Heart condition": {
        "who": "people with a heart condition",
        "have": "your usual heart medication and your doctor's plan",
        "watch": "chest pain or tightness, shortness of breath, a racing or irregular "
                 "heartbeat, dizziness or unusual tiredness",
        "urgent": "chest pain, severe breathlessness or fainting",
    },
    "Other lung condition (for example COPD)": {
        "who": "people with a lung condition",
        "have": "your usual medication and your doctor's plan",
        "watch": "more breathlessness than usual, coughing, wheezing or more phlegm",
        "urgent": "severe breathlessness that does not settle",
    },
    "Runner or outdoor worker": {
        "who": "runners and outdoor workers",
        "have": "water and a plan B (an indoor workout or a rest break)",
        "watch": "unusual breathlessness, coughing, a tight chest or light-headedness",
        "urgent": "chest pain, severe breathlessness or fainting",
    },
}


def personal_actions(label, p):
    if label == "Good":
        return [f"Normal activity is fine. Keep {p['have']} with you, as you normally would."]
    if label == "Moderate":
        return [f"Most {p['who']} are fine, but watch for {p['watch']}.",
                f"Keep {p['have']} handy."]
    if label == "Poor":
        return ["Cut down on hard outdoor activity and take things easier.",
                f"Watch for {p['watch']}, and stop and rest if you feel unwell.",
                f"Keep {p['have']} close."]
    return ["Stay indoors where you can, keep windows closed if possible, and avoid "
            "hard effort outside.",
            f"Keep {p['have']} ready, and watch for {p['watch']}.",
            f"Get medical help if you have {p['urgent']}."]


def advice_for(band_name):
    band = next(b for b in BANDS if b["name"] == band_name)
    return {
        "band": band_name,
        "colour": band["colour"],
        "alert_level": band["alert_level"],
        "general": band["general"],
        "groups": [
            {"key": k, "label": GROUP_LABELS[k], "advice": GROUP_ADVICE[band_name][k]}
            for k in GROUP_LABELS
        ],
        "personal": {name: personal_actions(band_name, p) for name, p in PROFILES.items()},
        "disclaimer": DISCLAIMER,
    }


@router.get("/bands")
def bands():
    """The PM2.5 bands with their colours and general advice (for the legend)."""
    return BANDS


@router.get("/{band_name}")
def advice(band_name: str):
    names = {b["name"].lower(): b["name"] for b in BANDS}
    key = band_name.lower().replace("_", " ").replace("-", " ")
    if key not in names:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Unknown band")
    return advice_for(names[key])