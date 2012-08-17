from django.core.urlresolvers import reverse
from c2g.models import Course, ProblemActivity, ProblemSet, ContentSection, Exercise, ProblemSetToExercise
from django.http import HttpResponse, Http404
from django.shortcuts import render_to_response, HttpResponseRedirect
from django.template import RequestContext
from courses.common_page_data import get_common_page_data
from courses.course_materials import get_course_materials
from django.views.decorators.csrf import csrf_exempt
from datetime import datetime
from problemsets.forms import *


# Filters all ProblemActivities by problem set and student. For each problem set, finds out how
# many questions there are and how many were completed to calculate progress on
# each problem set. Packages this information along with problem set
# information about deadlines into a dictionary and passes it to the template.

def list(request, course_prefix, course_suffix):
    try:
        common_page_data = get_common_page_data(request, course_prefix, course_suffix)
    except:
        raise Http404

    section_structures = get_course_materials(common_page_data=common_page_data, get_video_content=False, get_pset_content=True)

    return render_to_response('problemsets/'+common_page_data['course_mode']+'/list.html', {'common_page_data': common_page_data, 'section_structures':section_structures, 'context':'problemset_list'}, context_instance=RequestContext(request))

def show(request, course_prefix, course_suffix, pset_slug):
    try:
        common_page_data = get_common_page_data(request, course_prefix, course_suffix)
    except:
        raise Http404
    ps = ProblemSet.objects.getByCourse(course=common_page_data['course']).get(slug=pset_slug)
    problem_activities = ProblemActivity.objects.select_related('problemset_to_exercise').filter(student=request.user, problemset_to_exercise__problemSet=ps)
    psetToExs = ProblemSetToExercise.objects.getByProblemset(ps)
    activity_list = []
    for psetToEx in psetToExs:
        attempts = problem_activities.filter(problemset_to_exercise=psetToEx).order_by('-time_created')
        if len(attempts) > 0:
            activity_list.append(attempts[0])
    return render_to_response('problemsets/problemset.html',
                              {'common_page_data':common_page_data,
                               'pset': ps,
                               'pset_url':ps.path,
                               'pset_type':ps.assessment_type,
                               'pset_penalty':ps.late_penalty,
                               'pset_attempts_allowed':ps.submissions_permitted,
                               'activity_list': activity_list,
                              },
                              context_instance=RequestContext(request))

@csrf_exempt
def attempt(request, problemId):
    user = request.user
    problemset_to_exercise = ProblemSetToExercise.objects.distinct().get(problemSet__id=request.POST['pset_id'], exercise__fileName=request.POST['exercise_filename'], is_deleted=False)
    problem_activity = ProblemActivity(student = user,
                                        problemset_to_exercise = problemset_to_exercise,
                                        complete = request.POST['complete'],
                                        attempt_content = request.POST['attempt_content'],
                                        count_hints = request.POST['count_hints'],
                                        time_taken = request.POST['time_taken'],
                                        attempt_number = request.POST['attempt_number'],
                                        problem_type = request.POST['problem_type'],
                                        user_selection_val = request.POST['user_selection_val'],
                                        user_choices = request.POST['user_choices'])
    #In case no problem id is specified in template
    try:
        problem_activity.problem = request.POST['problem_identifier']
    except:
        pass

    problem_activity.save()
    if request.POST['complete'] == "1":
        return HttpResponse("complete")
    else:
        return HttpResponse("wrong")

def create_form(request, course_prefix, course_suffix):
    try:
        common_page_data = get_common_page_data(request, course_prefix, course_suffix)
    except:
        raise Http404
    content_sections = common_page_data['course'].contentsection_set.all()
    current_datetime = datetime.today().strftime('%m/%d/%Y %H:%M')
    return render_to_response('problemsets/create.html',
                            {'request': request,
                                'common_page_data': common_page_data,
                                'course_prefix': course_prefix,
                                'course_suffix': course_suffix,
                                'content_sections': content_sections,
                                'current_datetime': current_datetime
                            },
                            context_instance=RequestContext(request))

def model_create_form(request, course_prefix, course_suffix):
    try:
        common_page_data = get_common_page_data(request, course_prefix, course_suffix)
    except:
        raise Http404

    data = {'common_page_data': common_page_data}

    form = CreateProblemSet(course=common_page_data['course'])
    data['form'] = form

    return render_to_response('problemsets/model_create.html',
                              data,
                              context_instance=RequestContext(request))

def create_action(request):
    course_handle = request.POST['course_prefix'] + "#$!" + request.POST['course_suffix']
    course = Course.objects.get(handle=course_handle, mode='staging')
    content_section = ContentSection.objects.get(id=request.POST['content_section'])
    index = content_section.getNextIndex()

    pset = ProblemSet(course = course,
                    section = content_section,
                   slug = request.POST['slug'],
                   path = "/"+request.POST['course_prefix']+"/"+request.POST['course_suffix']+"/problemsets/"+request.POST['slug']+"/load_problem_set",
                   title = request.POST['title'],
                   live_datetime = datetime.strptime(request.POST['live_date'],'%m/%d/%Y %H:%M'),
                   due_date = datetime.strptime(request.POST['due_date'],'%m/%d/%Y %H:%M'),
                   grace_period = datetime.strptime(request.POST['grace_period'],'%m/%d/%Y %H:%M'),
                   partial_credit_deadline = datetime.strptime(request.POST['partial_credit_deadline'],'%m/%d/%Y %H:%M'),
                   assessment_type = request.POST['assessment_type'],
                   late_penalty = request.POST['late_penalty'],
                   submissions_permitted = request.POST['submissions_permitted'],
                   resubmission_penalty = request.POST['resubmission_penalty'],
                   mode = 'staging',
                   index=index)
    #Optional fields that may or may not be passed in the request
    try:
        pset.description = request.POST['description']
    except:
        pass
    pset.save()
    pset.create_production_instance()
    return HttpResponseRedirect(reverse('problemsets.views.manage_exercises', args=(request.POST['course_prefix'], request.POST['course_suffix'], pset.slug,)))

def edit_form(request, course_prefix, course_suffix, pset_slug):
    try:
        common_page_data = get_common_page_data(request, course_prefix, course_suffix)
    except:
        raise Http404
    pset = ProblemSet.objects.getByCourse(course=common_page_data['course']).get(slug=pset_slug)
    content_sections = ContentSection.objects.getByCourse(course=common_page_data['course'])
    #datetimes need to be converted to date picker format
    datetimes = {'live_datetime': pset.live_datetime.strftime('%m/%d/%Y %H:%M'),
                'due_date': pset.due_date.strftime('%m/%d/%Y %H:%M'),
                'grace_period': pset.grace_period.strftime('%m/%d/%Y %H:%M'),
                'partial_credit_deadline': pset.partial_credit_deadline.strftime('%m/%d/%Y %H:%M')}

    return render_to_response('problemsets/edit.html',
                            {'request': request,
                                'common_page_data': common_page_data,
                                'course_prefix': course_prefix,
                                'course_suffix': course_suffix,
                                'pset': pset,
                                'datetimes': datetimes,
                                'content_sections':content_sections
                            },
                            context_instance=RequestContext(request))

def edit_helper(request):
    pset = ProblemSet.objects.get(id=request.POST['pset_id'])
    content_section = ContentSection.objects.get(id=request.POST['content_section'])
    pset.section = content_section
    pset.slug = request.POST['slug']
    pset.path = "/"+request.POST['course_prefix']+"/"+request.POST['course_suffix']+"/problemsets/"+request.POST['slug']+"/load_problem_set"
    pset.title = request.POST['title']
    pset.description = request.POST['description']
    pset.live_datetime = datetime.strptime(request.POST['live_date'],'%m/%d/%Y %H:%M')
    pset.due_date = datetime.strptime(request.POST['due_date'],'%m/%d/%Y %H:%M')
    pset.grace_period = datetime.strptime(request.POST['grace_period'],'%m/%d/%Y %H:%M')
    pset.partial_credit_deadline = datetime.strptime(request.POST['partial_credit_deadline'],'%m/%d/%Y %H:%M')
    pset.assessment_type = request.POST['assessment_type']
    pset.late_penalty = request.POST['late_penalty']
    pset.submissions_permitted = request.POST['submissions_permitted']
    pset.save()

def edit_action(request):
    edit_helper(request)
    return HttpResponseRedirect(reverse('problemsets.views.list', args=(request.POST['course_prefix'], request.POST['course_suffix'], )))

def edit_publish_action(request):
    edit_helper(request)
    pset = ProblemSet.objects.get(id=request.POST['pset_id'])
    pset.commit()
    return HttpResponseRedirect(reverse('problemsets.views.list', args=(request.POST['course_prefix'], request.POST['course_suffix'], )))

def manage_exercises(request, course_prefix, course_suffix, pset_slug):
    try:
        common_page_data = get_common_page_data(request, course_prefix, course_suffix)
    except:
        raise Http404
    pset = ProblemSet.objects.get(course=common_page_data['course'], slug=pset_slug)
    psetToExs = ProblemSetToExercise.objects.getByProblemset(pset).select_related('exercise', 'problemSet')
    used_exercises = []
    problemset_taken = False
    if len(ProblemActivity.objects.filter(problemset_to_exercise__problemSet=pset.image)) > 0:
        problemset_taken = True
    #Get the list of exercises currently in this problem set
    for psetToEx in psetToExs:
        used_exercises.append(psetToEx.exercise.id)
    #Get all the exercises in the course but not in this problem set to list in add from existing
    exercises = Exercise.objects.all().filter(problemSet__course=common_page_data['course']).exclude(id__in=used_exercises).distinct()
    return render_to_response('problemsets/manage_exercises.html',
                            {'request': request,
                                'common_page_data': common_page_data,
                                'course_prefix': course_prefix,
                                'course_suffix': course_suffix,
                                'pset': pset,
                                'psetToExs': psetToExs,
                                'problemset_taken': problemset_taken,
                                'exercises': exercises
                            },
                            context_instance=RequestContext(request))

def add_exercise(request):
#    try:
#        common_page_data = get_common_page_data(request, course_prefix, course_suffix)
#    except:
#        raise Http404

    pset = ProblemSet.objects.get(id=request.POST['pset_id'])

    file_content = request.FILES['exercise']
    file_name = file_content.name

    exercise = Exercise()
    exercise.handle = request.POST['course_prefix'] + '#$!' + request.POST['course_suffix']
    exercise.fileName = file_name
    exercise.file.save(file_name, file_content)
    exercise.save()

    index = len(ProblemSetToExercise.objects.getByProblemset(pset))
    psetToEx = ProblemSetToExercise(problemSet=pset, exercise=exercise, number=index, is_deleted=0, mode='staging')
    psetToEx.save()
    return HttpResponseRedirect(reverse('problemsets.views.manage_exercises', args=(request.POST['course_prefix'], request.POST['course_suffix'], pset.slug,)))


def add_existing_exercises(request):
    pset = ProblemSet.objects.get(id=request.POST['pset_id'])
    exercise_ids = request.POST.getlist('exercise')
    exercises = Exercise.objects.filter(id__in=exercise_ids)
    for exercise in exercises:
        psetToEx = ProblemSetToExercise(problemSet=pset, exercise=exercise, number=len(ProblemSetToExercise.objects.getByProblemset(pset)), is_deleted=0, mode='staging')
        psetToEx.save()
    return HttpResponseRedirect(reverse('problemsets.views.manage_exercises', args=(request.POST['course_prefix'], request.POST['course_suffix'], pset.slug,)))

def save_helper(request):
    pset = ProblemSet.objects.get(id=request.POST['pset_id'])
    psetToExs = ProblemSetToExercise.objects.getByProblemset(pset)
    for n in range(0,len(psetToExs)):
        listName = "exercise_order[" + str(n) + "]"
        psetToExs[n].number = request.POST[listName]
        psetToExs[n].save()

def save_exercises(request):
    save_helper(request)
    pset = ProblemSet.objects.get(id=request.POST['pset_id'])
    return HttpResponseRedirect(reverse('problemsets.views.manage_exercises', args=(request.POST['course_prefix'], request.POST['course_suffix'], pset.slug,)))

def save_and_publish_exercises(request):
    save_helper(request)
    pset = ProblemSet.objects.get(id=request.POST['pset_id'])
    pset.commit()
    return HttpResponseRedirect(reverse('problemsets.views.list', args=(request.POST['course_prefix'], request.POST['course_suffix'])))


def read_exercise(request, course_prefix, course_suffix, exercise_name):
    try:
        common_page_data = get_common_page_data(request, course_prefix, course_suffix)
    except:
        raise Http404

    exercise = Exercise.objects.distinct().get(problemSet__course=common_page_data["course"], fileName=exercise_name)

    # return the contents of the file as an HTTP response.  Trust that it's there.
    #
    # TODO: put exception handling around this, figure out how to handle S3 errors
    # (file not there...)
    return HttpResponse(exercise.file.file)

def load_problem_set(request, course_prefix, course_suffix, pset_slug):
    try:
        common_page_data = get_common_page_data(request, course_prefix, course_suffix)
    except:
        raise Http404
    pset = ProblemSet.objects.get(course=common_page_data['course'], slug=pset_slug)
    psetToExs = ProblemSetToExercise.objects.getByProblemset(pset).select_related('exercise', 'problemSet')
    file_names = []
    for psetToEx in psetToExs:
        #Remove the .html from the end of the file name
        file_names.append(psetToEx.exercise.fileName[:-5])
    return render_to_response('problemsets/load_problem_set.html',{'file_names': file_names, 'assessment_type': pset.assessment_type},context_instance=RequestContext(request))

def delete_exercise(request):
    toDelete = ProblemSetToExercise.objects.get(id=request.POST['exercise_id'])
    toDelete.delete()
    toDelete.save()
    pset = toDelete.problemSet
    psetToExs = ProblemSetToExercise.objects.getByProblemset(pset)
    index = 0
    for psetToEx in psetToExs:
        psetToEx.number = index
        psetToEx.save()
        index += 1
    return HttpResponseRedirect(reverse('problemsets.views.manage_exercises', args=(request.POST['course_prefix'], request.POST['course_suffix'], pset.slug,)))

def revert_problemset(request):
    pset = ProblemSet.objects.get(id=request.POST['pset_id'])
    pset.revert()
    return HttpResponseRedirect(reverse('problemsets.views.list', args=(request.POST['course_prefix'], request.POST['course_suffix'])))
