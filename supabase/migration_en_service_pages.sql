-- migration_en_service_pages.sql — EN content keys for the new English
-- section (/en/services/edit.html + /en/services/web.html).
-- Idempotent: `on conflict do nothing` — never overwrites admin edits.
-- Fresh installs: run after seed.sql (schema.sql + seed.sql cover the rest).

insert into public.site_content (key, value) values
(
  'en_edit',
  '{
    "seo_title": "Video Editing | Reels, Shorts and YouTube | Amir Reza Lotfi",
    "seo_description": "Video editing by Amir Reza Lotfi: retention-first cuts for Reels, Shorts and YouTube, with captions, color and sound. First edit free.",
    "brand_name": "Amir Reza Lotfi",
    "footer_tagline": "Short-form video editor.",
    "eyebrow": "Video editing service",
    "hero_title": "Video Editing That Holds Attention",
    "hero_lead": "Reels, TikToks, Shorts and YouTube videos cut for retention — strong hooks, tight pacing, clean color and sound. Try me free before you pay.",
    "included_title": "Every Edit Ships With",
    "included_sub": "The same checklist on a 30-second Reel or a 12-minute video.",
    "included": [
      {"icon": "🪝", "title": "Hook-first structure", "text": "A first three seconds built to stop the scroll, then pattern interrupts that keep watch time climbing."},
      {"icon": "💬", "title": "Captions & subtitles", "text": "Readable, on-beat on-screen text — most feeds play muted, so captions are what actually get read."},
      {"icon": "🎞️", "title": "Pacing & b-roll", "text": "Dead air removed, cuts placed on the beat, b-roll and zooms used only where they earn attention."},
      {"icon": "🎨", "title": "Color & sound", "text": "Balanced grade across shots, leveled dialogue, music that supports instead of fights the voice."},
      {"icon": "📱", "title": "Platform-ready exports", "text": "Correct aspect ratios, safe margins and file settings for Reels, Shorts, TikTok and YouTube."},
      {"icon": "⚡", "title": "Fast turnaround", "text": "Short-form edits delivered within 48 hours, with two revision rounds included on every project."}
    ],
    "offer_title": "Your First Edit Is FREE",
    "offer_sub": "Send one raw clip. Get it back edited within 48 hours — keep it whatever you decide.",
    "steps_title": "How It Works",
    "faq_title": "Questions, Answered",
    "faq": [
      {"q": "How do I send my raw footage?", "a": "A Drive, Dropbox or unlisted YouTube link is enough — large files are fine, and a short note about your style helps."},
      {"q": "How many revision rounds do I get?", "a": "Two rounds of small revisions are included, so the final cut matches your brief without extra cost."},
      {"q": "How fast is delivery?", "a": "Short-form edits land within 48 hours. Longer YouTube videos usually take a few days, and urgent work can be scheduled."},
      {"q": "Do you write the captions?", "a": "Yes — hooks, on-screen captions and subtitles are part of the edit, styled for each platform and timed to the beat."},
      {"q": "What does paid work cost?", "a": "Per video, agreed up front based on length and complexity. The free edit exists so you can judge the result before spending anything."}
    ],
    "related_title": "Related Services",
    "form_title": "Get Your Free Edit"
  }'
),
(
  'en_web',
  '{
    "seo_title": "Web Design | Fast, SEO-Friendly Sites | Amir Reza Lotfi",
    "seo_description": "Fast, mobile-first websites and landing pages by Amir Reza Lotfi, built for speed and search, with support after launch.",
    "brand_name": "Amir Reza Lotfi",
    "footer_tagline": "Short-form video editor.",
    "eyebrow": "Web design service",
    "hero_title": "Websites Built to Load Fast and Rank",
    "hero_lead": "Clean, mobile-first sites and landing pages — light, quick and structured for search. Launched with support, not abandoned after handoff.",
    "included_title": "Every Website Ships With",
    "included_sub": "The checklist that separates a real site from a template.",
    "included": [
      {"icon": "📱", "title": "Mobile-first layout", "text": "Designed at phone width first, then scaled up — most of your visitors never see the desktop view."},
      {"icon": "⚡", "title": "Speed optimization", "text": "Lean HTML and CSS, local fonts, lazy images — fast loads improve both rankings and conversions."},
      {"icon": "🔎", "title": "On-page SEO", "text": "Unique titles and descriptions, one clear heading per page, structured data, sitemap and canonical tags."},
      {"icon": "🧭", "title": "Clear structure", "text": "Hero, services, proof, FAQ and contact — the path a visitor expects, with one obvious next step."},
      {"icon": "✍️", "title": "Content help", "text": "I shape the headlines and page flow with you, so the copy sells instead of just filling space."},
      {"icon": "🛠️", "title": "Support after launch", "text": "Edits, updates and hosting help when you need them — the site keeps working after go-live."}
    ],
    "offer_title": "Your First Short Edit Is FREE",
    "offer_sub": "Every site deserves video on it — so the first edit for your new site is on the house.",
    "steps_title": "How It Works",
    "faq_title": "Questions, Answered",
    "faq": [
      {"q": "How long does a website take?", "a": "A one-page landing site takes a few days. A multi-page business site usually takes one to two weeks, including content and revisions."},
      {"q": "Do you write the content?", "a": "I structure the pages and headlines with you, and you provide the final texts — or I can draft them from your notes."},
      {"q": "Will the site rank on Google?", "a": "Every site ships with clean HTML, unique titles and descriptions, structured data, a sitemap and fast load times — the foundations search engines need."},
      {"q": "Do you offer support after launch?", "a": "Yes — updates, small redesigns and hosting help are available as a monthly retainer or per request."}
    ],
    "related_title": "Related Services",
    "form_title": "Start Your Project"
  }'
)
on conflict (key) do nothing;

-- per-page channel toggles for the two new EN pages (mirror the EN home
-- defaults: email/telegram/whatsapp/linkedin/youtube on, phone/rubika off).
update public.site_content
set value = (
  select jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{page_channels}',
    coalesce(value -> 'page_channels', '{}'::jsonb)
      || jsonb_build_object(
           'en_edit', value -> 'page_channels' -> 'en',
           'en_web',  value -> 'page_channels' -> 'en'
         )
  )
  from public.site_content sc
  where sc.key = 'business'
)
where key = 'business'
  and coalesce(value -> 'page_channels' -> 'en_edit', 'null'::jsonb) = 'null'::jsonb;
